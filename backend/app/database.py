from contextlib import contextmanager
from typing import Iterator

import httpx
from supabase import Client, create_client
from supabase.client import ClientOptions

from .config import settings


def require_supabase_configuration() -> None:
    if not settings.supabase_configured:
        raise RuntimeError(
            "Supabase is not configured. Check SUPABASE_URL, "
            "SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY "
            "in the backend environment."
        )


@contextmanager
def supabase_connection(
    *,
    privileged: bool = False,
) -> Iterator[Client]:
    """
    Create a short-lived Supabase client.

    The normal client uses the publishable key.
    Privileged clients use the backend secret key and bypass RLS.

    Callers must never sign users into a privileged client.
    """
    require_supabase_configuration()

    key = (
        settings.supabase_secret_key
        if privileged
        else settings.supabase_publishable_key
    )

    timeout = float(settings.supabase_timeout_seconds)

    # Closing the context also closes its HTTP connections.
    with httpx.Client(
        timeout=httpx.Timeout(timeout),
        follow_redirects=False,
    ) as transport:
        client = create_client(
            settings.supabase_url,
            key,
            options=ClientOptions(
                schema="public",
                auto_refresh_token=False,
                persist_session=False,
                postgrest_client_timeout=timeout,
                storage_client_timeout=timeout,
                httpx_client=transport,
            ),
        )

        yield client


@contextmanager
def user_database(access_token: str) -> Iterator[Client]:
    """
    Run database requests with the user's access token.

    Authentication code must verify the token before calling this.
    Supabase also validates the token when applying database policies.
    """
    token = access_token.strip()

    if not token or any(character.isspace() for character in token):
        raise ValueError("A valid access token is required.")

    with supabase_connection() as client:
        # Preserve the publishable API key while using the user's
        # identity for PostgREST queries and Row Level Security.
        client.postgrest.auth(token)

        yield client


@contextmanager
def privileged_database() -> Iterator[Client]:
    """
    Backend-only connection for explicitly authorized operations.

    Examples:
    - Seeding built-in rubric templates.
    - Saving validated AI assessments after checking draft ownership.

    This client bypasses RLS. Routes must check authorization before
    using it, and must never accept arbitrary table/query instructions
    from the browser.
    """
    with supabase_connection(privileged=True) as client:
        yield client