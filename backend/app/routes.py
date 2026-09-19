import asyncio
import logging
from uuid import UUID
from .embeddings import (
    EmbeddingError,
    compare_draft_texts,
)

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from .reflection import (
    ReflectionError,
    analyze_reflection,
)
from starlette.concurrency import run_in_threadpool

from .auth import CurrentUser, StudentUser, TeacherUser
from .comparison import compare_drafts
from .config import settings
from .database import privileged_database
from .grading import GradingError, grade_essay
from .schemas import (
    DraftCreate,
    EssayCreate,
    RubricCreate,
    TeacherReviewCreate,
    validate_scores_against_rubric,
)
from .document_parser import (
    DocumentExtractionError,
    extract_document_text,
)


router = APIRouter(prefix="/api")
logger = logging.getLogger("draftloop")


# --------------------------------------------------
# Database helpers
# --------------------------------------------------

def require_record(database, table: str, record_id: str) -> dict:
    response = (
        database.table(table)
        .select("*")
        .eq("id", str(record_id))
        .limit(1)
        .execute()
    )

    if not response.data:
        # RLS also returns no rows when the user cannot access a record.
        raise HTTPException(
            status_code=404,
            detail="The requested record was not found or is unavailable.",
        )

    return response.data[0]


def select_rows(
    database,
    table: str,
    *,
    filters: dict | None = None,
    order_by: str = "created_at",
    descending: bool = False,
) -> list[dict]:
    """Read rows in batches with a stable ordering."""
    rows = []
    offset = 0
    batch_size = 100

    # teacher_students uses a composite primary key.
    tie_breakers = (
        ("teacher_id", "student_id")
        if table == "teacher_students"
        else ("id",)
    )

    while True:
        query = database.table(table).select("*")

        for column, value in (filters or {}).items():
            query = query.eq(column, value)

        query = query.order(
            order_by,
            desc=descending,
        )

        for column in tie_breakers:
            if column != order_by:
                query = query.order(column)

        response = query.range(
            offset,
            offset + batch_size - 1,
        ).execute()

        batch = response.data or []
        rows.extend(batch)

        if len(batch) < batch_size:
            return rows

        offset += batch_size


def rubric_record(row: dict) -> dict:
    item = dict(row)
    item["categories"] = item.pop("categories_json")
    return item


def essay_record(row: dict) -> dict:
    item = dict(row)
    item["rubric"] = item.pop("rubric_snapshot_json")
    return item


def review_record(row: dict) -> dict:
    item = dict(row)
    item["category_scores"] = item.pop("category_scores_json")
    return item


def find_assessment(database, draft_id: str) -> dict | None:
    response = (
        database.table("assessments")
        .select("*")
        .eq("draft_id", str(draft_id))
        .limit(1)
        .execute()
    )

    return response.data[0] if response.data else None


def assessment_record(database, row: dict) -> dict:
    item = dict(row)
    item["result"] = item.pop("result_json")

    reviews = select_rows(
        database,
        "teacher_reviews",
        filters={"assessment_id": item["id"]},
    )

    item["teacher_reviews"] = [
        review_record(review)
        for review in reviews
    ]

    item["latest_teacher_review"] = (
        item["teacher_reviews"][-1]
        if item["teacher_reviews"]
        else None
    )

    return item


def draft_record(database, row: dict) -> dict:
    item = dict(row)

    # Internal grading ownership token is not needed by the frontend.
    item.pop("grading_attempt_id", None)

    assessment = find_assessment(database, item["id"])

    item["assessment"] = (
        assessment_record(database, assessment)
        if assessment else None
    )

    return item


def essay_detail(database, essay_id: str) -> dict:
    essay = require_record(database, "essays", essay_id)

    drafts = select_rows(
        database,
        "drafts",
        filters={"essay_id": essay["id"]},
        order_by="draft_number",
    )

    return {
        **essay_record(essay),
        "drafts": [
            draft_record(database, draft)
            for draft in drafts
        ],
    }


def essay_summaries(database, filters: dict) -> list[dict]:
    essays = select_rows(
        database,
        "essays",
        filters=filters,
        order_by="updated_at",
        descending=True,
    )

    result = []

    for essay in essays:
        item = essay_record(essay)

        count_response = (
            database.table("drafts")
            .select("id", count="exact")
            .eq("essay_id", essay["id"])
            .limit(1)
            .execute()
        )

        latest_response = (
            database.table("drafts")
            .select("*")
            .eq("essay_id", essay["id"])
            .order("draft_number", desc=True)
            .limit(1)
            .execute()
        )

        item["draft_count"] = count_response.count or 0

        item["latest_draft"] = (
            draft_record(database, latest_response.data[0])
            if latest_response.data
            else None
        )

        result.append(item)

    return result


def privileged_rpc(name: str, parameters: dict):
    """
    Call only hardcoded backend grading functions.

    Never accept a function name directly from a browser request.
    """
    with privileged_database() as database:
        return database.rpc(name, parameters).execute().data


def record_grading_failure(
    draft_id: str,
    attempt_id: str,
    message: str,
) -> None:
    try:
        privileged_rpc(
            "fail_grading",
            {
                "p_draft_id": draft_id,
                "p_attempt_id": attempt_id,
                "p_message": message,
            },
        )
    except Exception:
        # Do not replace the original error if failure recording also fails.
        # The grading lease allows a later attempt to recover.
        logger.error(
            "Could not record grading failure for draft %s.",
            draft_id,
        )


# --------------------------------------------------
# Health and authenticated profile
# --------------------------------------------------

@router.get("/health")
def health():
    return {
        "status": "ok",
        "ai_configured": settings.ai_configured,
        "ai_provider": settings.ai_provider,

        # Temporary compatibility for frontend components updated next.
        "groq_configured": settings.ai_configured,
        "supabase_configured": settings.supabase_configured,
        "model": settings.ai_model,
        "max_essay_characters": min(
            settings.max_essay_characters,
            30000,
        ),
        "mode": "authenticated",
    }


@router.get("/me")
def current_profile(user: CurrentUser):
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
    }


@router.get("/teachers")
def assigned_teachers(user: StudentUser):
    assignments = select_rows(
        user.database,
        "teacher_students",
        filters={"student_id": user.id},
        order_by="teacher_id",
    )

    teachers = []

    for assignment in assignments:
        response = (
            user.database.table("profiles")
            .select("id, display_name, role")
            .eq("id", assignment["teacher_id"])
            .eq("role", "teacher")
            .limit(1)
            .execute()
        )

        if response.data:
            teachers.append(response.data[0])

    return teachers


# --------------------------------------------------
# Rubrics
# --------------------------------------------------

@router.get("/rubrics")
def list_rubrics(user: CurrentUser):
    rows = select_rows(
        user.database,
        "rubrics",
        order_by="name",
    )

    # Templates first, then alphabetically by name.
    rows.sort(
        key=lambda row: (
            not row["is_template"],
            row["name"].casefold(),
        )
    )

    return [rubric_record(row) for row in rows]


@router.post("/rubrics", status_code=201)
def create_rubric(payload: RubricCreate, user: CurrentUser):
    response = (
        user.database.table("rubrics")
        .insert({
            "owner_id": user.id,
            "name": payload.name,
            "description": payload.description,
            "categories_json": [
                category.model_dump(mode="json")
                for category in payload.categories
            ],
        })
        .execute()
    )

    return rubric_record(response.data[0])


@router.put("/rubrics/{rubric_id}")
def update_rubric(
    rubric_id: str,
    payload: RubricCreate,
    user: CurrentUser,
):
    existing = require_record(
        user.database,
        "rubrics",
        rubric_id,
    )

    if existing["is_template"] or existing["owner_id"] != user.id:
        raise HTTPException(
            status_code=403,
            detail=(
                "You can only edit your own custom rubrics. "
                "Create a copy to customize this rubric."
            ),
        )

    response = (
        user.database.table("rubrics")
        .update({
            "name": payload.name,
            "description": payload.description,
            "categories_json": [
                category.model_dump(mode="json")
                for category in payload.categories
            ],
        })
        .eq("id", rubric_id)
        .eq("owner_id", user.id)
        .execute()
    )

    if not response.data:
        raise HTTPException(
            status_code=404,
            detail="The rubric is no longer available.",
        )

    return rubric_record(response.data[0])


# --------------------------------------------------
# Essays
# --------------------------------------------------

@router.post("/essays", status_code=201)
def create_essay(payload: EssayCreate, user: StudentUser):
    require_record(
        user.database,
        "rubrics",
        payload.rubric_id,
    )

    teacher_id = (
        str(payload.teacher_id)
        if payload.teacher_id else None
    )

    if teacher_id:
        assignment = (
            user.database.table("teacher_students")
            .select("teacher_id")
            .eq("student_id", user.id)
            .eq("teacher_id", teacher_id)
            .limit(1)
            .execute()
        )

        if not assignment.data:
            raise HTTPException(
                status_code=403,
                detail="This teacher is not assigned to your account.",
            )

    # The database derives student identity and freezes the rubric.
    response = (
        user.database.table("essays")
        .insert({
            "title": payload.title,
            "assignment_prompt": payload.assignment_prompt,
            "rubric_id": payload.rubric_id,
            "teacher_id": teacher_id,
        })
        .execute()
    )

    return essay_record(response.data[0])


@router.get("/essays")
def list_essays(user: CurrentUser):
    filters = (
        {"student_id": user.id}
        if user.role == "student"
        else {"teacher_id": user.id}
    )

    return essay_summaries(user.database, filters)


@router.get("/essays/{essay_id}")
def get_essay(essay_id: UUID, user: CurrentUser):
    return essay_detail(user.database, str(essay_id))


# --------------------------------------------------
# Drafts
# --------------------------------------------------

@router.post("/essays/{essay_id}/drafts", status_code=201)
def create_draft(
    essay_id: UUID,
    payload: DraftCreate,
    user: StudentUser,
):
    essay = require_record(
        user.database,
        "essays",
        str(essay_id),
    )

    if essay["student_id"] != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the essay owner can submit a draft.",
        )

    # The database assigns draft_number inside a locked transaction.
    response = (
        user.database.table("drafts")
        .insert({
            "essay_id": str(essay_id),
            "content": payload.content,
            "reflection": payload.reflection,
        })
        .execute()
    )

    return draft_record(user.database, response.data[0])


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: UUID, user: CurrentUser):
    draft = require_record(
        user.database,
        "drafts",
        str(draft_id),
    )

    return draft_record(user.database, draft)


# --------------------------------------------------
# AI grading
# --------------------------------------------------

def prepare_grading(database, draft_id: str, student_id: str):
    draft = require_record(database, "drafts", draft_id)
    essay = require_record(database, "essays", draft["essay_id"])

    if essay["student_id"] != student_id:
        raise HTTPException(
            status_code=403,
            detail="Only the essay owner can request grading.",
        )

    if find_assessment(database, draft_id):
        return {
            "status": "already_graded",
            "draft": draft_record(database, draft),
        }

        if not settings.ai_configured:
            raise HTTPException(
                status_code=503,
                detail=(
                    f"{settings.ai_provider.capitalize()} is not configured. "
                    "Set the selected provider's API key in backend/.env."
                ),
            )

        if settings.ai_timeout_seconds > 570:
            raise HTTPException(
                status_code=503,
                detail="AI_TIMEOUT_SECONDS must not exceed 570.",
            )

    claim = privileged_rpc(
        "claim_grading",
        {
            "p_draft_id": draft_id,
            "p_student_id": student_id,
            "p_lease_seconds": max(
                30,
                settings.ai_timeout_seconds + 30,
            ),
        },
    )

    if claim["status"] == "busy":
        raise HTTPException(
            status_code=409,
            detail="This draft is already being graded.",
        )

    if claim["status"] == "already_graded":
        fresh = require_record(database, "drafts", draft_id)

        return {
            "status": "already_graded",
            "draft": draft_record(database, fresh),
        }

    return {
        "status": "claimed",
        "attempt_id": claim["attempt_id"],
        "content": draft["content"],
        "assignment_prompt": essay["assignment_prompt"],
        "rubric": RubricCreate.model_validate(
            essay["rubric_snapshot_json"]
        ),
    }


@router.post("/drafts/{draft_id}/grade")
async def grade_draft(draft_id: UUID, user: StudentUser):
    draft_id_text = str(draft_id)

    prepared = await run_in_threadpool(
        prepare_grading,
        user.database,
        draft_id_text,
        user.id,
    )

    if prepared["status"] == "already_graded":
        return prepared["draft"]

    attempt_id = prepared["attempt_id"]

    try:
        result = await grade_essay(
            content=prepared["content"],
            rubric=prepared["rubric"],
            assignment_prompt=prepared["assignment_prompt"],
        )

        await run_in_threadpool(
            privileged_rpc,
            "complete_grading",
            {
                "p_draft_id": draft_id_text,
                "p_attempt_id": attempt_id,
                "p_result": result,
            },
        )

    except GradingError as exc:
        await run_in_threadpool(
            record_grading_failure,
            draft_id_text,
            attempt_id,
            exc.message,
        )

        raise HTTPException(
            status_code=exc.status_code,
            detail={
                "message": exc.message,
                "code": exc.code,
                "retryable": exc.retryable,
                "draft_id": draft_id_text,
            },
        ) from exc

    except asyncio.CancelledError:
        # An abandoned attempt can be reclaimed after its lease expires.
        raise

    except Exception:
        await run_in_threadpool(
            record_grading_failure,
            draft_id_text,
            attempt_id,
            "Grading could not be completed. Refresh the draft before retrying.",
        )
        raise

    # If the session expired during grading, the saved result still exists.
    # The user can refresh after renewing their session.
    return await run_in_threadpool(
        get_draft,
        draft_id,
        user,
    )


# --------------------------------------------------
# Revision comparison
# --------------------------------------------------

@router.get("/essays/{essay_id}/compare")
def compare_essay_drafts(
    essay_id: UUID,
    older_id: UUID,
    newer_id: UUID,
    user: CurrentUser,
):
    essay = require_record(
        user.database,
        "essays",
        str(essay_id),
    )

    older = require_record(
        user.database,
        "drafts",
        str(older_id),
    )

    newer = require_record(
        user.database,
        "drafts",
        str(newer_id),
    )

    if (
        older["essay_id"] != str(essay_id)
        or newer["essay_id"] != str(essay_id)
    ):
        raise HTTPException(
            status_code=422,
            detail="Select two drafts of this essay.",
        )

    if older["draft_number"] >= newer["draft_number"]:
        raise HTTPException(
            status_code=422,
            detail="Select the older draft first.",
        )

    return compare_drafts(
        older_draft=older,
        newer_draft=newer,
        rubric=RubricCreate.model_validate(
            essay["rubric_snapshot_json"]
        ),
        older_assessment=find_assessment(
            user.database,
            str(older_id),
        ),
        newer_assessment=find_assessment(
            user.database,
            str(newer_id),
        ),
    )


# --------------------------------------------------
# Progress
# --------------------------------------------------

@router.get("/essays/{essay_id}/progress")
def essay_progress(essay_id: UUID, user: CurrentUser):
    essay = essay_detail(user.database, str(essay_id))
    points = []

    for draft in essay["drafts"]:
        assessment = draft["assessment"]

        review = (
            assessment["latest_teacher_review"]
            if assessment else None
        )

        points.append({
            "draft_id": draft["id"],
            "draft_number": draft["draft_number"],
            "created_at": draft["created_at"],
            "status": draft["status"],
            "ai_total": (
                assessment["total_score"] if assessment else None
            ),
            "max_score": (
                assessment["max_score"] if assessment else None
            ),
            "category_scores": (
                assessment["result"]["category_scores"]
                if assessment else []
            ),
            "teacher_total": (
                review["total_score"] if review else None
            ),
        })

    return {
        "essay_id": str(essay_id),
        "title": essay["title"],
        "rubric": essay["rubric"],
        "points": points,
    }


# --------------------------------------------------
# Teacher review
# --------------------------------------------------

@router.get("/teacher/submissions")
def teacher_submissions(user: TeacherUser):
    return essay_summaries(
        user.database,
        {"teacher_id": user.id},
    )


@router.post(
    "/assessments/{assessment_id}/reviews",
    status_code=201,
)
def create_teacher_review(
    assessment_id: UUID,
    payload: TeacherReviewCreate,
    user: TeacherUser,
):
    assessment = require_record(
        user.database,
        "assessments",
        str(assessment_id),
    )

    draft = require_record(
        user.database,
        "drafts",
        assessment["draft_id"],
    )

    essay = require_record(
        user.database,
        "essays",
        draft["essay_id"],
    )

    if essay["teacher_id"] != user.id:
        raise HTTPException(
            status_code=403,
            detail="You are not the assigned teacher for this essay.",
        )

    rubric = RubricCreate.model_validate(
        essay["rubric_snapshot_json"]
    )

    try:
        validate_scores_against_rubric(
            payload.category_scores,
            rubric,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc

    # The SQL trigger rechecks assignment, derives teacher identity,
    # and calculates the reviewed total.
    response = (
        user.database.table("teacher_reviews")
        .insert({
            "assessment_id": str(assessment_id),
            "category_scores_json": [
                score.model_dump(mode="json")
                for score in payload.category_scores
            ],
            "reason": payload.reason,
        })
        .execute()
    )

    return review_record(response.data[0])
@router.post("/documents/extract")
def extract_uploaded_document(
    user: StudentUser,
    upload: UploadFile = File(...),
):
    del user

    try:
        document_bytes = upload.file.read()

        content = extract_document_text(
            filename=upload.filename,
            content_type=upload.content_type,
            data=document_bytes,
        )

    except DocumentExtractionError as error:
        raise HTTPException(
            status_code=422,
            detail=str(error),
        ) from error

    except Exception as error:
        logger.exception(
            "Document extraction failed for %s",
            upload.filename,
        )

        raise HTTPException(
            status_code=422,
            detail="The uploaded document could not be processed.",
        ) from error

    return {
        "filename": upload.filename,
        "content": content,
        "characters": len(content),
    }
@router.post("/drafts/{draft_id}/reflection")
async def analyze_student_reflection(
    draft_id: str,
    user: StudentUser,
):
    def load_reflection_context():
        draft_response = (
            user.database
            .table("drafts")
            .select("id,essay_id,reflection,status")
            .eq("id", draft_id)
            .maybe_single()
            .execute()
        )

        draft = draft_response.data

        if not draft:
            raise HTTPException(
                status_code=404,
                detail="Draft not found.",
            )

        essay_response = (
            user.database
            .table("essays")
            .select("id,student_id")
            .eq("id", draft["essay_id"])
            .eq("student_id", user.id)
            .maybe_single()
            .execute()
        )

        if not essay_response.data:
            raise HTTPException(
                status_code=404,
                detail="Draft not found.",
            )

        assessment_response = (
            user.database
            .table("assessments")
            .select("result_json,total_score,max_score")
            .eq("draft_id", draft_id)
            .maybe_single()
            .execute()
        )

        assessment = assessment_response.data

        if not assessment:
            raise HTTPException(
                status_code=409,
                detail="Grade the draft before analyzing reflection.",
            )

        reflection_text = (draft.get("reflection") or "").strip()

        if not reflection_text:
            raise HTTPException(
                status_code=422,
                detail="Add a reflection before analyzing it.",
            )

        return reflection_text, {
            "result": assessment.get("result_json") or {},
            "total_score": assessment.get("total_score"),
            "max_score": assessment.get("max_score"),
        }

    reflection_text, feedback = await run_in_threadpool(
        load_reflection_context,
    )

    try:
        analysis = await analyze_reflection(
            reflection_text,
            feedback,
        )

    except ReflectionError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "message": error.message,
                "retryable": error.retryable,
                "code": "reflection_analysis_failed",
            },
        ) from error

    def save_analysis():
        return (
            privileged_database()
            .table("student_reflections")
            .upsert(
                {
                    "draft_id": draft_id,
                    "student_id": essay["student_id"],
                    "reflection_text": reflection_text,
                    "analysis_json": analysis,
                },
                on_conflict="draft_id",
            )
            .execute()
        )

    await run_in_threadpool(save_analysis)

    return {
        "draft_id": draft_id,
        "reflection_text": reflection_text,
        "analysis": analysis,
    }
@router.post("/drafts/{draft_id}/semantic-drift")
async def analyze_semantic_drift(
    draft_id: str,
    user: StudentUser,
):
    current_result = (
        user.database
        .table("drafts")
        .select("id, essay_id, content, created_at")
        .eq("id", draft_id)
        .maybe_single()
        .execute()
    )

    current_draft = current_result.data

    if not current_draft:
        raise HTTPException(
            status_code=404,
            detail="Draft not found.",
        )

    essay_result = (
        user.database
        .table("essays")
        .select("id, student_id")
        .eq("id", current_draft["essay_id"])
        .maybe_single()
        .execute()
    )

    essay = essay_result.data

    if not essay or essay["student_id"] != user.id:
        raise HTTPException(
            status_code=403,
            detail="You cannot analyze this draft.",
        )

    previous_result = (
        user.database
        .table("drafts")
        .select("id, content, created_at")
        .eq("essay_id", current_draft["essay_id"])
        .lt("created_at", current_draft["created_at"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    previous_drafts = previous_result.data or []

    if not previous_drafts:
        return {
            "draft_id": draft_id,
            "previous_draft_id": None,
            "similarity": None,
            "drift_label": "first_draft",
            "message": "This is the first draft, so no revision comparison is available yet.",
        }

    previous_draft = previous_drafts[0]

    try:
        analysis = await compare_draft_texts(
            previous_text=previous_draft["content"],
            current_text=current_draft["content"],
        )
    except EmbeddingError as error:
        raise HTTPException(
            status_code=502,
            detail=str(error),
        ) from error

    with privileged_database() as admin_db:
        saved_result = (
            admin_db
            .table("draft_semantic_analysis")
            .upsert(
                {
                    "draft_id": draft_id,
                    "essay_id": current_draft["essay_id"],
                    "student_id": essay["student_id"],
                    "previous_draft_id": previous_draft["id"],
                    "embedding": analysis["embedding"],
                    "similarity": analysis["similarity"],
                    "drift_label": analysis["drift_label"],
                    "analysis_json": {
                        "similarity": analysis["similarity"],
                        "drift_label": analysis["drift_label"],
                    },
                },
                on_conflict="draft_id",
            )
            .execute()
        )

    return {
        "draft_id": draft_id,
        "previous_draft_id": previous_draft["id"],
        "similarity": analysis["similarity"],
        "drift_label": analysis["drift_label"],
        "analysis": saved_result.data[0]
        if saved_result.data
        else None,
    }