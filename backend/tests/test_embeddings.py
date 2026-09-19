from app.embeddings import (
    classify_drift,
    cosine_similarity,
)


def test_identical_embeddings_are_stable():
    similarity = cosine_similarity(
        [1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
    )

    assert similarity == 1.0
    assert classify_drift(similarity) == "stable"


def test_moderate_similarity_is_classified_correctly():
    similarity = cosine_similarity(
        [1.0, 0.0],
        [0.8, 0.6],
    )

    assert round(similarity, 2) == 0.8
    assert classify_drift(similarity) == "moderate"


def test_opposite_embeddings_are_major_drift():
    similarity = cosine_similarity(
        [1.0, 0.0],
        [-1.0, 0.0],
    )

    assert similarity == -1.0
    assert classify_drift(similarity) == "major"


def test_mismatched_dimensions_raise_error():
    try:
        cosine_similarity([1.0], [1.0, 0.0])
    except Exception as error:
        assert "dimensions" in str(error).lower()
    else:
        raise AssertionError("Expected a dimension mismatch error.")