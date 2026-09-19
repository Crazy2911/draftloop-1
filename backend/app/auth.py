from dataclasses import dataclass, field
from typing import Annotated, Iterator, Literal

import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from postgrest.exceptions import APIError
from supabase import Client
from supabase_auth.errors import AuthApiError

from .config import settings
from .database import supabase_connection, user_database


bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str
    display_name: str
    role: Literal["student", "teacher"]

    # Never include the database client in a printed representation.
    database: Client = field(repr=False, compare=False)


def unauthorized(message: str = "Please sign in again.") -> HTTPException:
    return HTTPException(
        status_code=401,
        detail=message,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(bearer_scheme),
    ],
) -> Iterator[AuthenticatedUser]:
    """
    Verify the session and provide a user-scoped database client.

    This synchronous dependency runs through FastAPI's thread pool.
    The yielded client's connections close after the request completes.
    """
    if credentials is None:
        raise unauthorized("Sign in to access this resource.")

    if credentials.scheme.lower() != "bearer":
        raise unauthorized("A Bearer access token is required.")

    token = credentials.credentials.strip()

    if not token or any(character.isspace() for character in token):
        raise unauthorized("The access token is invalid.")

    if not settings.supabase_configured:
        raise HTTPException(
            status_code=503,
            detail="Authentication is not configured on the backend.",
        )

    # Ask Supabase Auth to validate the token.
    # Do not merely decode the JWT and trust its contents.
    try:
        with supabase_connection() as client:
            response = client.auth.get_user(token)
            auth_user = response.user

    except AuthApiError as exc:
        status = str(getattr(exc, "status", ""))

        if status in {"400", "401", "403", "422"}:
            raise unauthorized(
                "Your session is invalid or expired. Please sign in again."
            ) from exc

        raise HTTPException(
            status_code=503,
            detail=(
                "Authentication is temporarily unavailable. "
                "Please try again."
            ),
        ) from exc

    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the authentication service. "
                "Please try again."
            ),
        ) from exc

    if auth_user is None:
        raise unauthorized()

    if getattr(auth_user, "is_anonymous", False):
        raise unauthorized(
            "Sign in with an email account to continue."
        )

    if not auth_user.email or not auth_user.email_confirmed_at:
        raise HTTPException(
            status_code=403,
            detail="Verify your email address before using the app.",
        )

    user_id = str(auth_user.id)

    # Use the same verified user's token for database access.
    # The publishable key remains the API key; RLS uses the user identity.
    with user_database(token) as database:
        try:
            result = (
                database.table("profiles")
                .select("id, display_name, role")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )

        except APIError as exc:
            code = str(getattr(exc, "code", ""))

            if code in {"PGRST301", "PGRST303"}:
                raise unauthorized(
                    "Your session expired. Please sign in again."
                ) from exc

            raise HTTPException(
                status_code=503,
                detail=(
                    "Could not load your account profile. "
                    "Check the Supabase schema and access policies."
                ),
            ) from exc

        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=503,
                detail="Could not reach the profile database.",
            ) from exc

        if not result.data:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Your account profile is missing. "
                    "Contact the project administrator."
                ),
            )

        profile = result.data[0]
        role = profile.get("role")

        if role not in {"student", "teacher"}:
            raise HTTPException(
                status_code=403,
                detail="Your account does not have a supported role.",
            )

        yield AuthenticatedUser(
            id=user_id,
            email=auth_user.email,
            display_name=profile["display_name"],
            role=role,
            database=database,
        )


CurrentUser = Annotated[
    AuthenticatedUser,
    Depends(get_current_user),
]


def require_teacher(user: CurrentUser) -> AuthenticatedUser:
    if user.role != "teacher":
        raise HTTPException(
            status_code=403,
            detail="Teacher access is required.",
        )

    return user


def require_student(user: CurrentUser) -> AuthenticatedUser:
    if user.role != "student":
        raise HTTPException(
            status_code=403,
            detail="Student access is required.",
        )

    return user


TeacherUser = Annotated[
    AuthenticatedUser,
    Depends(require_teacher),
]

StudentUser = Annotated[
    AuthenticatedUser,
    Depends(require_student),
]