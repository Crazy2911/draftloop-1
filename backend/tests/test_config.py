import pytest

from app.config import configured_key, validate_origin


def test_real_key_is_detected():
    assert configured_key("AIzaSyExampleKey123")


def test_placeholder_key_is_not_detected():
    assert not configured_key("your_gemini_api_key_here")
    assert not configured_key("replace_with_key")
    assert not configured_key("")


def test_valid_local_origin_is_accepted():
    assert (
        validate_origin(
            "http://127.0.0.1:5173/",
            "CORS_ORIGINS",
        )
        == "http://127.0.0.1:5173"
    )


def test_valid_https_origin_is_accepted():
    assert (
        validate_origin(
            "https://draftloop.vercel.app",
            "CORS_ORIGINS",
        )
        == "https://draftloop.vercel.app"
    )


def test_origin_with_path_is_rejected():
    with pytest.raises(ValueError):
        validate_origin(
            "https://draftloop.vercel.app/dashboard",
            "CORS_ORIGINS",
        )


def test_origin_with_credentials_is_rejected():
    with pytest.raises(ValueError):
        validate_origin(
            "https://user:password@example.com",
            "CORS_ORIGINS",
        )