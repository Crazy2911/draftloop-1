import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import require_supabase_configuration
from .routes import router
from .templates import seed_rubric_templates


logger = logging.getLogger("draftloop")


@asynccontextmanager
async def lifespan(application: FastAPI):
    require_supabase_configuration()

    try:
        # Supabase calls use the synchronous SDK.
        # Run startup database work outside the event loop.
        await run_in_threadpool(seed_rubric_templates)

    except Exception as exc:
        logger.error(
            "Supabase startup failed. Error type: %s",
            type(exc).__name__,
        )

        raise RuntimeError(
            "Could not initialize Supabase templates. "
            "Check the backend Supabase configuration and confirm "
            "that schema.sql and grading.sql were executed."
        ) from None

        if not settings.ai_configured:
            logger.warning(
                "%s API key is missing. AI grading will remain unavailable "
                "until the backend configuration is updated.",
                settings.ai_provider.capitalize(),
            )
    yield


api_app = FastAPI(
    title="DraftLoop API",
    description=(
        "Authenticated essay feedback with Supabase, rubric-based "
        "Groq grading, draft comparisons, and teacher reviews."
    ),
    version="0.2.0",
    lifespan=lifespan,
)


@api_app.exception_handler(APIError)
async def supabase_database_error(
    request: Request,
    exc: APIError,
):
    code = str(getattr(exc, "code", ""))

    # Avoid returning raw database details or query contents.
    logger.warning("Supabase database request failed: %s", code)

    if code in {"PGRST301", "PGRST303"}:
        return JSONResponse(
            status_code=401,
            headers={"WWW-Authenticate": "Bearer"},
            content={
                "detail": (
                    "Your session is invalid or expired. "
                    "Please sign in again."
                )
            },
        )

    if code == "42501":
        return JSONResponse(
            status_code=403,
            content={
                "detail": (
                    "You do not have permission to perform this action."
                )
            },
        )

    if code == "23505":
        return JSONResponse(
            status_code=409,
            content={
                "detail": (
                    "This record already exists. "
                    "Refresh before submitting again."
                )
            },
        )

    if code == "23503":
        return JSONResponse(
            status_code=409,
            content={
                "detail": (
                    "A related record is unavailable. "
                    "Refresh and check your selection."
                )
            },
        )

    if code in {"23502", "23514", "22P02", "22001"}:
        return JSONResponse(
            status_code=422,
            content={
                "detail": (
                    "The submitted data does not meet the database "
                    "requirements. Check the form values."
                )
            },
        )

    if code == "P0001":
        return JSONResponse(
            status_code=409,
            content={
                "detail": (
                    "The operation was rejected by a database rule. "
                    "Refresh the record and check your permissions "
                    "and submitted values."
                )
            },
        )

    if code in {"40001", "40P01", "55P03", "57014"}:
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": "2"},
            content={
                "detail": (
                    "The database could not complete this operation. "
                    "Refresh the saved state before retrying."
                )
            },
        )

    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "The database request could not be completed. "
                "Check the backend logs and Supabase configuration."
            )
        },
    )


@api_app.exception_handler(httpx.TimeoutException)
async def upstream_timeout(
    request: Request,
    exc: httpx.TimeoutException,
):
    return JSONResponse(
        status_code=504,
        content={
            "detail": (
                "A backend service timed out. Refresh to check "
                "whether your change was saved before retrying."
            )
        },
    )


@api_app.exception_handler(httpx.HTTPError)
async def upstream_connection_error(
    request: Request,
    exc: httpx.HTTPError,
):
    logger.warning(
        "Backend service request failed. Error type: %s",
        type(exc).__name__,
    )

    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "A backend service is unavailable. "
                "Check your connection and refresh before retrying."
            )
        },
    )


@api_app.exception_handler(Exception)
async def unexpected_error(
    request: Request,
    exc: Exception,
):
    # Do not log request bodies, access tokens, or API keys.
    logger.error(
        "Unhandled application error. Error type: %s",
        type(exc).__name__,
    )

    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                "An unexpected server error occurred. "
                "Check the backend logs."
            )
        },
    )


@api_app.get("/")
def root():
    return {
        "name": "DraftLoop API",
        "documentation": "/docs",
        "health": "/api/health",
        "mode": "authenticated",
    }


api_app.include_router(router)


# Wrap the complete application so error responses also receive
# CORS headers for approved frontend origins.
app = CORSMiddleware(
    app=api_app,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
    ],
)