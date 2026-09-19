from app.grading import remove_invalid_quotes, quote_is_exact
from app.schemas import AIGrade, RubricCreate


def make_rubric() -> RubricCreate:
    return RubricCreate(
        name="Argumentative Essay",
        categories=[
            {
                "id": "argument",
                "name": "Argument",
                "description": "Evaluates reasoning.",
                "max_points": 100,
            }
        ],
    )


def make_grade() -> AIGrade:
    return AIGrade(
        category_scores=[
            {
                "category_id": "argument",
                "score": 80,
                "reason": "The essay presents a clear claim.",
                "evidence": [
                    {
                        "paragraph_index": 0,
                        "quote": "Education improves opportunity.",
                        "occurrence": 0,
                    },
                    {
                        "paragraph_index": 0,
                        "quote": "This quote does not exist.",
                        "occurrence": 0,
                    },
                ],
            }
        ],
        overall_feedback="The essay has a clear argument.",
        comments=[
            {
                "category_id": "argument",
                "kind": "argument",
                "severity": "suggestion",
                "message": "Add more support for the claim.",
                "suggestion": "Include one specific example.",
                "paragraph_index": 0,
                "quote": "Education improves opportunity.",
                "occurrence": 0,
            },
            {
                "category_id": "argument",
                "kind": "argument",
                "severity": "suggestion",
                "message": "This quote is invalid.",
                "suggestion": "Use an exact quote.",
                "paragraph_index": 0,
                "quote": "Missing quote",
                "occurrence": 0,
            },
        ],
        strengths=["The central claim is clear."],
        next_steps=["Add stronger supporting evidence."],
    )


def test_exact_quote_is_found():
    paragraphs = ["Education improves opportunity."]

    assert quote_is_exact(
        paragraphs,
        paragraph_index=0,
        quote="Education improves opportunity.",
        occurrence=0,
    )


def test_incorrect_quote_is_rejected():
    paragraphs = ["Education improves opportunity."]

    assert not quote_is_exact(
        paragraphs,
        paragraph_index=0,
        quote="Education creates opportunity.",
        occurrence=0,
    )


def test_invalid_paragraph_is_rejected():
    paragraphs = ["Education improves opportunity."]

    assert not quote_is_exact(
        paragraphs,
        paragraph_index=2,
        quote="Education improves opportunity.",
        occurrence=0,
    )


def test_quote_occurrence_is_checked():
    paragraphs = ["Strong evidence. Strong evidence."]

    assert quote_is_exact(
        paragraphs,
        paragraph_index=0,
        quote="Strong evidence.",
        occurrence=1,
    )

    assert not quote_is_exact(
        paragraphs,
        paragraph_index=0,
        quote="Strong evidence.",
        occurrence=2,
    )


def test_invalid_evidence_and_comments_are_removed():
    paragraphs = ["Education improves opportunity."]
    cleaned = remove_invalid_quotes(make_grade(), paragraphs)

    assert len(cleaned.category_scores[0].evidence) == 1
    assert (
        cleaned.category_scores[0].evidence[0].quote
        == "Education improves opportunity."
    )

    assert len(cleaned.comments) == 1
    assert cleaned.comments[0].quote == "Education improves opportunity."