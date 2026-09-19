import json
import re
from difflib import SequenceMatcher
from typing import Any

from .schemas import (
    AIGrade,
    RubricCreate,
    split_paragraphs,
    validate_ai_grade,
)


def text_changes(
    older_content: str,
    newer_content: str,
) -> list[dict[str, str]]:
    """
    Return exact text segments for a diff view.

    Whitespace is preserved. Joining all segments except 'insert'
    reconstructs the older draft. Joining all except 'delete'
    reconstructs the newer draft.
    """
    older_tokens = re.findall(r"\s+|\w+|[^\w\s]", older_content)
    newer_tokens = re.findall(r"\s+|\w+|[^\w\s]", newer_content)

    matcher = SequenceMatcher(
        None,
        older_tokens,
        newer_tokens,
        autojunk=True,
    )

    segments: list[dict[str, str]] = []

    def append_segment(kind: str, text: str) -> None:
        if not text:
            return

        if segments and segments[-1]["type"] == kind:
            segments[-1]["text"] += text
        else:
            segments.append({
                "type": kind,
                "text": text,
            })

    for operation, old_start, old_end, new_start, new_end in (
        matcher.get_opcodes()
    ):
        if operation == "equal":
            append_segment(
                "equal",
                "".join(older_tokens[old_start:old_end]),
            )

        elif operation == "delete":
            append_segment(
                "delete",
                "".join(older_tokens[old_start:old_end]),
            )

        elif operation == "insert":
            append_segment(
                "insert",
                "".join(newer_tokens[new_start:new_end]),
            )

        elif operation == "replace":
            append_segment(
                "delete",
                "".join(older_tokens[old_start:old_end]),
            )
            append_segment(
                "insert",
                "".join(newer_tokens[new_start:new_end]),
            )

    return segments


def read_assessment(
    assessment: dict[str, Any] | None,
    draft: dict[str, Any],
    rubric: RubricCreate,
) -> AIGrade | None:
    """
    Read and validate an assessment.

    Supports Supabase JSONB dictionaries and legacy JSON strings.
    """
    if assessment is None:
        return None

    if str(assessment["draft_id"]) != str(draft["id"]):
        raise ValueError(
            "The assessment does not belong to the selected draft."
        )

    stored_result = assessment.get("result_json")

    if isinstance(stored_result, str):
        result = json.loads(stored_result)
    elif isinstance(stored_result, dict):
        result = stored_result
    else:
        raise ValueError(
            "Stored assessment must be a JSON object."
        )

    if not isinstance(result, dict):
        raise ValueError(
            "Stored assessment must be a JSON object."
        )

    # Exclude metadata such as model name, totals, and duration
    # before passing the result to the strict AIGrade schema.
    grade_fields = {
        name: result[name]
        for name in AIGrade.model_fields
        if name in result
    }

    grade = AIGrade.model_validate(grade_fields)

    validate_ai_grade(
        grade,
        rubric,
        split_paragraphs(draft["content"]),
    )

    return grade


def score_summary(
    grade: AIGrade | None,
    maximum: float,
) -> dict[str, float] | None:
    if grade is None:
        return None

    total = round(
        sum(category.score for category in grade.category_scores),
        2,
    )

    return {
        "total_score": total,
        "max_score": maximum,
        "percentage": round(total / maximum * 100, 2),
    }


def feedback_summary(
    grade: AIGrade | None,
) -> dict[str, Any] | None:
    if grade is None:
        return None

    return {
        "overall_feedback": grade.overall_feedback,
        "strengths": grade.strengths,
        "next_steps": grade.next_steps,
        "comments": [
            comment.model_dump()
            for comment in grade.comments
        ],
    }


def compare_drafts(
    *,
    older_draft: dict[str, Any],
    newer_draft: dict[str, Any],
    rubric: RubricCreate,
    older_assessment: dict[str, Any] | None = None,
    newer_assessment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Compare two drafts belonging to one essay.

    Routes must load `rubric` from that essay's frozen rubric snapshot,
    not from the potentially edited rubric library.

    Text comparison works even when one or both drafts lack grades.
    """
    if older_draft["essay_id"] != newer_draft["essay_id"]:
        raise ValueError(
            "Select two drafts of the same essay."
        )

    if older_draft["draft_number"] >= newer_draft["draft_number"]:
        raise ValueError(
            "The first draft must be older than the second draft."
        )

    older_grade = read_assessment(
        older_assessment,
        older_draft,
        rubric,
    )
    newer_grade = read_assessment(
        newer_assessment,
        newer_draft,
        rubric,
    )

    maximum = round(
        sum(category.max_points for category in rubric.categories),
        2,
    )

    older_summary = score_summary(older_grade, maximum)
    newer_summary = score_summary(newer_grade, maximum)

    older_scores = (
        {
            item.category_id: item
            for item in older_grade.category_scores
        }
        if older_grade else {}
    )

    newer_scores = (
        {
            item.category_id: item
            for item in newer_grade.category_scores
        }
        if newer_grade else {}
    )

    category_changes = []

    for category in rubric.categories:
        before = older_scores.get(category.id)
        after = newer_scores.get(category.id)

        delta = (
            round(after.score - before.score, 2)
            if before is not None and after is not None
            else None
        )

        if delta is None:
            direction = "unavailable"
        elif delta > 0:
            direction = "increased"
        elif delta < 0:
            direction = "decreased"
        else:
            direction = "unchanged"

        category_changes.append({
            "category_id": category.id,
            "name": category.name,
            "max_points": category.max_points,
            "older_score": before.score if before else None,
            "newer_score": after.score if after else None,
            "delta": delta,
            "direction": direction,
            "older_reason": before.reason if before else None,
            "newer_reason": after.reason if after else None,
        })

    total_delta = (
        round(
            newer_summary["total_score"]
            - older_summary["total_score"],
            2,
        )
        if older_summary is not None and newer_summary is not None
        else None
    )

    # Only compare grading configuration when both grades exist.
    comparable_configuration = None

    if older_assessment is not None and newer_assessment is not None:
        comparable_configuration = (
            older_assessment["model"] == newer_assessment["model"]
            and older_assessment["prompt_version"]
            == newer_assessment["prompt_version"]
        )

    notices = []

    if older_grade is None or newer_grade is None:
        notices.append(
            "Grade both drafts to see all score changes. "
            "Text differences are available now."
        )

    if comparable_configuration is False:
        notices.append(
            "These drafts used different models or prompt versions. "
            "Score changes may partly reflect that difference."
        )

    return {
        "essay_id": older_draft["essay_id"],
        "older_draft": {
            "id": older_draft["id"],
            "draft_number": older_draft["draft_number"],
            "created_at": older_draft["created_at"],
        },
        "newer_draft": {
            "id": newer_draft["id"],
            "draft_number": newer_draft["draft_number"],
            "created_at": newer_draft["created_at"],
        },
        "text_changed": (
            older_draft["content"] != newer_draft["content"]
        ),
        "text_diff": text_changes(
            older_draft["content"],
            newer_draft["content"],
        ),
        "score_source": "ai",
        "older_summary": older_summary,
        "newer_summary": newer_summary,
        "total_delta": total_delta,
        "category_changes": category_changes,
        "older_feedback": feedback_summary(older_grade),
        "newer_feedback": feedback_summary(newer_grade),
        "same_grading_configuration": comparable_configuration,
        "notices": notices,
    }