import math
import re
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from .config import settings


ShortText = Annotated[
    str,
    Field(min_length=1, max_length=200),
]

DescriptionText = Annotated[
    str,
    Field(min_length=1, max_length=3000),
]

CategoryID = Annotated[
    str,
    Field(
        min_length=1,
        max_length=60,
        pattern=r"^[a-z][a-z0-9_-]*$",
    ),
]

NonNegativeScore = Annotated[
    float,
    Field(ge=0, allow_inf_nan=False),
]


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )


class FormModel(StrictModel):
    model_config = ConfigDict(
        str_strip_whitespace=True,
    )


# --------------------------------------------------
# Rubrics
# --------------------------------------------------

class RubricCategory(FormModel):
    id: CategoryID
    name: ShortText
    description: DescriptionText

    max_points: float = Field(
        gt=0,
        le=1000,
        allow_inf_nan=False,
    )


class RubricCreate(FormModel):
    name: ShortText
    description: str = Field(default="", max_length=3000)

    categories: list[RubricCategory] = Field(
        min_length=1,
        max_length=12,
    )

    @model_validator(mode="after")
    def validate_categories(self):
        category_ids = [
            category.id
            for category in self.categories
        ]

        category_names = [
            category.name.casefold()
            for category in self.categories
        ]

        if len(category_ids) != len(set(category_ids)):
            raise ValueError(
                "Rubric category IDs must be unique."
            )

        if len(category_names) != len(set(category_names)):
            raise ValueError(
                "Rubric category names must be unique."
            )

        return self


# --------------------------------------------------
# Essays and drafts
# --------------------------------------------------

class EssayCreate(FormModel):
    # Student identity comes from the verified session.
    title: ShortText

    assignment_prompt: str = Field(
        default="",
        max_length=5000,
    )

    rubric_id: str = Field(
        min_length=1,
        max_length=100,
    )

    # None means independent practice without teacher review.
    # A supplied teacher must be assigned to this student.
    teacher_id: UUID | None = None


class DraftCreate(StrictModel):
    # Preserve original whitespace for comments and comparisons.
    # The SQL schema also enforces a hard 30,000-character ceiling.
    content: str = Field(
        min_length=1,
        max_length=min(
            settings.max_essay_characters,
            30000,
        ),
    )

    reflection: str = Field(
        default="",
        max_length=3000,
    )

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Essay text cannot be empty.")

        if "\x00" in value:
            raise ValueError(
                "Essay text contains a null character."
            )

        return value

    @field_validator("reflection")
    @classmethod
    def validate_reflection(cls, value: str) -> str:
        if "\x00" in value:
            raise ValueError(
                "Reflection contains a null character."
            )

        return value


# --------------------------------------------------
# AI assessment output
# --------------------------------------------------

class CategoryScore(FormModel):
    category_id: CategoryID
    score: NonNegativeScore
    reason: DescriptionText


class EvidenceQuote(StrictModel):
    paragraph_index: int = Field(ge=0)

    quote: str = Field(
        min_length=1,
        max_length=2000,
    )

    occurrence: int = Field(default=0, ge=0)

    @field_validator("quote")
    @classmethod
    def reject_blank_quote(cls, value: str) -> str:
        if not value.strip():
            raise ValueError(
                "Evidence quotes cannot be blank."
            )

        return value


class CategoryFeedback(CategoryScore):
    evidence: list[EvidenceQuote] = Field(
        default_factory=list,
        max_length=3,
    )


class InlineComment(EvidenceQuote):
    category_id: CategoryID

    kind: Literal[
        "structure",
        "argument",
        "grammar",
        "clarity",
        "other",
    ]

    severity: Literal[
        "suggestion",
        "important",
    ]

    message: DescriptionText
    suggestion: DescriptionText


class AIGrade(FormModel):
    category_scores: list[CategoryFeedback] = Field(
        min_length=1,
        max_length=12,
    )

    overall_feedback: DescriptionText

    comments: list[InlineComment] = Field(
        default_factory=list,
        max_length=20,
    )

    strengths: list[ShortText] = Field(
        default_factory=list,
        max_length=5,
    )

    next_steps: list[DescriptionText] = Field(
        default_factory=list,
        max_length=3,
    )


# --------------------------------------------------
# Teacher review
# --------------------------------------------------

class TeacherReviewCreate(FormModel):
    # Teacher identity comes from the verified session.
    reason: DescriptionText

    category_scores: list[CategoryScore] = Field(
        min_length=1,
        max_length=12,
    )


# --------------------------------------------------
# Rubric-dependent validation
# --------------------------------------------------

def validate_scores_against_rubric(
    scores: list[CategoryScore],
    rubric: RubricCreate,
) -> tuple[float, float]:
    categories = {
        category.id: category
        for category in rubric.categories
    }

    supplied_ids = [
        score.category_id
        for score in scores
    ]

    if len(supplied_ids) != len(set(supplied_ids)):
        raise ValueError(
            "Duplicate category scores were returned."
        )

    if set(supplied_ids) != set(categories):
        raise ValueError(
            "Scores must include every rubric category exactly once."
        )

    for score in scores:
        category = categories[score.category_id]

        if score.score > category.max_points:
            raise ValueError(
                f"Score for '{category.name}' exceeds "
                f"its maximum of {category.max_points}."
            )

    total = math.fsum(
        score.score
        for score in scores
    )

    maximum = math.fsum(
        category.max_points
        for category in rubric.categories
    )

    return round(total, 2), round(maximum, 2)


def split_paragraphs(content: str) -> list[str]:
    return [
        paragraph
        for paragraph in re.split(
            r"(?:\r?\n)[ \t]*(?:\r?\n)",
            content,
        )
        if paragraph.strip()
    ]


def locate_quote(
    evidence: EvidenceQuote,
    paragraphs: list[str],
) -> tuple[int, int]:
    if evidence.paragraph_index >= len(paragraphs):
        raise ValueError(
            "Evidence references a missing paragraph."
        )

    paragraph = paragraphs[evidence.paragraph_index]
    search_from = 0
    start = -1

    for _ in range(evidence.occurrence + 1):
        start = paragraph.find(
            evidence.quote,
            search_from,
        )

        if start == -1:
            raise ValueError(
                "Evidence quote or its occurrence was not found "
                "in the referenced paragraph."
            )

        search_from = start + len(evidence.quote)

    return start, start + len(evidence.quote)


def validate_ai_grade(
    grade: AIGrade,
    rubric: RubricCreate,
    paragraphs: list[str],
) -> tuple[float, float]:
    total, maximum = validate_scores_against_rubric(
        grade.category_scores,
        rubric,
    )

    category_ids = {
        category.id
        for category in rubric.categories
    }

    for category in grade.category_scores:
        for evidence in category.evidence:
            locate_quote(evidence, paragraphs)

    for comment in grade.comments:
        if comment.category_id not in category_ids:
            raise ValueError(
                "An inline comment references an unknown category."
            )

        locate_quote(comment, paragraphs)

    return total, maximum