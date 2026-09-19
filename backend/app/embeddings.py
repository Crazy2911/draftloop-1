from __future__ import annotations
import asyncio
import math
from typing import Any

import httpx

from .config import settings


EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIMENSIONS = 768


class EmbeddingError(Exception):
    """Raised when semantic embedding generation fails."""


def cosine_similarity(
    first: list[float],
    second: list[float],
) -> float:
    if not first or not second:
        raise EmbeddingError("Embeddings cannot be empty.")

    if len(first) != len(second):
        raise EmbeddingError("Embedding dimensions do not match.")

    dot_product = sum(a * b for a, b in zip(first, second))
    first_norm = math.sqrt(sum(value * value for value in first))
    second_norm = math.sqrt(sum(value * value for value in second))

    if first_norm == 0 or second_norm == 0:
        raise EmbeddingError("Cannot compare a zero-length embedding.")

    similarity = dot_product / (first_norm * second_norm)

    return max(-1.0, min(1.0, similarity))


def classify_drift(similarity: float) -> str:
    if similarity >= 0.90:
        return "stable"

    if similarity >= 0.75:
        return "moderate"

    return "major"


def _normalize(values: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in values))

    if norm == 0:
        raise EmbeddingError("Gemini returned an empty embedding.")

    return [value / norm for value in values]


def _extract_values(payload: dict[str, Any]) -> list[float]:
    embedding = payload.get("embedding")

    if isinstance(embedding, dict):
        values = embedding.get("values")
        if isinstance(values, list):
            return [float(value) for value in values]

    embeddings = payload.get("embeddings")

    if isinstance(embeddings, list) and embeddings:
        first_embedding = embeddings[0]

        if isinstance(first_embedding, dict):
            values = first_embedding.get("values")
            if isinstance(values, list):
                return [float(value) for value in values]

    raise EmbeddingError("Gemini returned an invalid embedding response.")


async def embed_text(text: str) -> list[float]:
    cleaned_text = text.strip()

    if not cleaned_text:
        raise EmbeddingError("Cannot embed empty text.")

    if len(cleaned_text) > settings.max_essay_characters:
        raise EmbeddingError("Text is too long to embed.")

    if not settings.gemini_configured:
        raise EmbeddingError(
            "Gemini API key is not configured."
        )

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/{EMBEDDING_MODEL}:embedContent"
    )

    payload = {
        "model": f"models/{EMBEDDING_MODEL}",
        "taskType": "SEMANTIC_SIMILARITY",
        "content": {
            "parts": [
                {
                    "text": cleaned_text,
                }
            ]
        },
        "output_dimensionality": EMBEDDING_DIMENSIONS,
    }

    headers = {
        "x-goog-api-key": settings.gemini_api_key,
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                url,
                headers=headers,
                json=payload,
            )
    except httpx.HTTPError as error:
        raise EmbeddingError(
            "Could not connect to Gemini embeddings."
        ) from error

    if response.status_code >= 400:
        raise EmbeddingError(
            f"Gemini embedding request failed "
            f"with status {response.status_code}."
        )

    try:
        response_payload = response.json()
        values = _extract_values(response_payload)
    except (ValueError, TypeError, KeyError) as error:
        raise EmbeddingError(
            "Gemini returned invalid embedding data."
        ) from error

    if len(values) != EMBEDDING_DIMENSIONS:
        raise EmbeddingError(
            "Gemini returned an unexpected embedding dimension."
        )

    return _normalize(values)


async def compare_draft_texts(
    previous_text: str,
    current_text: str,
) -> dict[str, Any]:
    previous_embedding, current_embedding = await asyncio.gather(
        embed_text(previous_text),
        embed_text(current_text),
    )

    similarity = cosine_similarity(
        previous_embedding,
        current_embedding,
    )

    return {
        "embedding": current_embedding,
        "similarity": round(similarity, 6),
        "drift_label": classify_drift(similarity),
    }