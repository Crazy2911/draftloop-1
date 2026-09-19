import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv


BACKEND_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BACKEND_DIR / ".env", override=False)


def environment_value(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def positive_integer(name: str, default: int) -> int:
    raw_value = environment_value(name, str(default))

    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(
            f"{name} must be a positive integer."
        ) from error

    if value <= 0:
        raise ValueError(f"{name} must be a positive integer.")

    return value


def validate_origin(
    value: str,
    setting_name: str,
    *,
    require_https: bool = False,
) -> str:
    value = value.strip().rstrip("/")

    try:
        parsed = urlsplit(value)
        # Accessing port also validates its format and range.
        parsed.port
    except ValueError as error:
        raise ValueError(
            f"{setting_name} must contain a valid URL origin."
        ) from error

    allowed_schemes = {"https"} if require_https else {"http", "https"}

    if (
        parsed.scheme not in allowed_schemes
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path
        or parsed.query
        or parsed.fragment
        or any(character.isspace() for character in value)
    ):
        raise ValueError(
            f"{setting_name} must contain only a URL origin, "
            "such as https://example.com."
        )

    return value


def allowed_origins() -> tuple[str, ...]:
    raw_value = environment_value(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )

    origins: list[str] = []

    for item in raw_value.split(","):
        item = item.strip()

        if not item:
            continue

        if item == "*":
            raise ValueError(
                "CORS_ORIGINS must list your frontend origins explicitly."
            )

        origin = validate_origin(item, "CORS_ORIGINS")

        if origin not in origins:
            origins.append(origin)

    if not origins:
        raise ValueError(
            "CORS_ORIGINS must contain at least one frontend origin."
        )

    return tuple(origins)


def read_supabase_url() -> str:
    value = environment_value("SUPABASE_URL")

    if not value:
        return ""

    return validate_origin(
        value,
        "SUPABASE_URL",
        require_https=True,
    )


def configured_key(value: str, placeholder: str = "") -> bool:
    normalized = value.strip().lower()

    return bool(normalized) and (
        normalized != placeholder.lower()
        and not normalized.startswith(
            ("your_", "your-", "replace_", "replace-")
        )
        and normalized not in {"...", "changeme"}
    )


def read_ai_provider() -> str:
    provider = environment_value("AI_PROVIDER", "groq").lower()

    if provider not in {"groq", "gemini"}:
        raise ValueError(
            "AI_PROVIDER must be either 'groq' or 'gemini'."
        )

    return provider


@dataclass(frozen=True)
class Settings:
    ai_provider: str
    ai_timeout_seconds: int

    groq_api_key: str = field(repr=False)
    groq_model: str
    groq_timeout_seconds: int

    gemini_api_key: str = field(repr=False)
    gemini_model: str

    supabase_url: str
    supabase_publishable_key: str = field(repr=False)
    supabase_secret_key: str = field(repr=False)
    supabase_timeout_seconds: int

    cors_origins: tuple[str, ...]
    max_essay_characters: int

    @property
    def groq_configured(self) -> bool:
        return configured_key(
            self.groq_api_key,
            "your_groq_api_key_here",
        )

    @property
    def gemini_configured(self) -> bool:
        return configured_key(
            self.gemini_api_key,
            "your_gemini_api_key_here",
        )

    @property
    def ai_configured(self) -> bool:
        if self.ai_provider == "gemini":
            return self.gemini_configured

        return self.groq_configured

    @property
    def ai_model(self) -> str:
        if self.ai_provider == "gemini":
            return self.gemini_model

        return self.groq_model

    @property
    def supabase_configured(self) -> bool:
        return (
            bool(self.supabase_url)
            and "your-project" not in self.supabase_url.lower()
            and "your_project" not in self.supabase_url.lower()
            and configured_key(self.supabase_publishable_key)
            and configured_key(self.supabase_secret_key)
        )


groq_timeout = positive_integer("GROQ_TIMEOUT_SECONDS", 90)

settings = Settings(
    ai_provider=read_ai_provider(),
    ai_timeout_seconds=positive_integer(
        "AI_TIMEOUT_SECONDS",
        groq_timeout,
    ),
    groq_api_key=environment_value("GROQ_API_KEY"),
    groq_model=environment_value(
        "GROQ_MODEL",
        "openai/gpt-oss-120b",
    ),
    groq_timeout_seconds=groq_timeout,
    gemini_api_key=environment_value("GEMINI_API_KEY"),
    gemini_model=environment_value(
        "GEMINI_MODEL",
        "gemini-2.5-flash",
    ),
    supabase_url=read_supabase_url(),
    supabase_publishable_key=environment_value(
        "SUPABASE_PUBLISHABLE_KEY"
    ),
    supabase_secret_key=environment_value(
        "SUPABASE_SECRET_KEY"
    ),
    supabase_timeout_seconds=positive_integer(
        "SUPABASE_TIMEOUT_SECONDS",
        20,
    ),
    cors_origins=allowed_origins(),
    max_essay_characters=positive_integer(
        "MAX_ESSAY_CHARACTERS",
        30000,
    ),
)