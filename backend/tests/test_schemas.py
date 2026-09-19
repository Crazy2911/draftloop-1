import pytest
from pydantic import ValidationError

from app.schemas import (
    DraftCreate,
    RubricCreate,
    split_paragraphs,
)


def make_rubric() -> RubricCreate:
    return RubricCreate(
        name="Argumentative Essay",
        description="Evaluate a persuasive essay.",
        categories=[
            {
                "id": "argument",
                "name": "Argument Strength",
                "description": "Evaluates the central claim and reasoning.",
                "max_points": 40,
            },
            {
                "id": "structure",
                "name": "Structure",
                "description": "Evaluates organization and progression.",
                "max_points": 30,
            },
            {
                "id": "language",
                "name": "Language",
                "description": "Evaluates grammar and clarity.",
                "max_points": 30,
            },
        ],
    )


def test_valid_rubric_is_accepted():
    rubric = make_rubric()

    assert rubric.name == "Argumentative Essay"
    assert len(rubric.categories) == 3
    assert rubric.categories[0].max_points == 40


def test_duplicate_rubric_category_ids_are_rejected():
    with pytest.raises(ValidationError):
        RubricCreate(
            name="Invalid Rubric",
            categories=[
                {
                    "id": "argument",
                    "name": "Argument",
                    "description": "First category.",
                    "max_points": 50,
                },
                {
                    "id": "argument",
                    "name": "Another Argument",
                    "description": "Duplicate category ID.",
                    "max_points": 50,
                },
            ],
        )


def test_invalid_category_id_is_rejected():
    with pytest.raises(ValidationError):
        RubricCreate(
            name="Invalid Rubric",
            categories=[
                {
                    "id": "Argument Category",
                    "name": "Argument",
                    "description": "IDs cannot contain spaces.",
                    "max_points": 100,
                }
            ],
        )


def test_blank_draft_content_is_rejected():
    with pytest.raises(ValidationError):
        DraftCreate(content="   \n\t   ")


def test_draft_content_is_preserved():
    draft = DraftCreate(
        content="  First paragraph.\n\nSecond paragraph.  ",
        reflection="I improved my argument.",
    )

    assert draft.content.startswith("  First paragraph.")
    assert draft.content.endswith("  ")
    assert draft.reflection == "I improved my argument."


def test_essay_paragraphs_are_split_for_quote_matching():
    paragraphs = split_paragraphs(
        "First paragraph.\n\nSecond paragraph.\r\n\r\nThird paragraph."
    )

    assert paragraphs == [
        "First paragraph.",
        "Second paragraph.",
        "Third paragraph.",
    ]