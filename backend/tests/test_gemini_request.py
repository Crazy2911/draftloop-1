import asyncio

import httpx
import pytest

from app.grading import GradingError, request_gemini


def run_async(coroutine):
    return asyncio.run(coroutine)


def test_gemini_json_response_is_parsed():
    async def scenario():
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=200,
                json={
                    "candidates": [
                        {
                            "finishReason": "STOP",
                            "content": {
                                "parts": [
                                    {
                                        "text": '{"overall_feedback":"Good"}'
                                    }
                                ]
                            },
                        }
                    ]
                },
            )

        transport = httpx.MockTransport(handler)

        async with httpx.AsyncClient(
            transport=transport
        ) as client:
            result = await request_gemini(
                client,
                [
                    {
                        "role": "system",
                        "content": "Return JSON.",
                    },
                    {
                        "role": "user",
                        "content": "Grade this essay.",
                    },
                ],
            )

        assert result == '{"overall_feedback":"Good"}'

    run_async(scenario())


def test_gemini_rate_limit_is_converted_to_grading_error():
    async def scenario():
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=429,
                json={"error": {"message": "Quota exceeded"}},
            )

        transport = httpx.MockTransport(handler)

        async with httpx.AsyncClient(
            transport=transport
        ) as client:
            with pytest.raises(GradingError) as error:
                await request_gemini(
                    client,
                    [
                        {
                            "role": "system",
                            "content": "Return JSON.",
                        },
                        {
                            "role": "user",
                            "content": "Grade this essay.",
                        },
                    ],
                )

        assert error.value.code == "ai_rate_limited"
        assert error.value.status_code == 429
        assert error.value.retryable is True

    run_async(scenario())


def test_gemini_empty_candidates_are_rejected():
    async def scenario():
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                status_code=200,
                json={"candidates": []},
            )

        transport = httpx.MockTransport(handler)

        async with httpx.AsyncClient(
            transport=transport
        ) as client:
            with pytest.raises(ValueError):
                await request_gemini(
                    client,
                    [
                        {
                            "role": "system",
                            "content": "Return JSON.",
                        },
                        {
                            "role": "user",
                            "content": "Grade this essay.",
                        },
                    ],
                )

    run_async(scenario())