BEGIN;

ALTER TABLE public.drafts
ADD COLUMN IF NOT EXISTS grading_attempt_id uuid;


-- ==================================================
-- Claim a draft for grading
-- ==================================================

CREATE OR REPLACE FUNCTION public.claim_grading(
    p_draft_id uuid,
    p_student_id uuid,
    p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    selected_draft public.drafts%ROWTYPE;
    essay_owner uuid;
    attempt_id uuid;
BEGIN
    IF p_lease_seconds IS NULL
       OR p_lease_seconds < 30
       OR p_lease_seconds > 600
    THEN
        RAISE EXCEPTION 'Invalid grading lease duration';
    END IF;

    SELECT * INTO selected_draft
    FROM public.drafts
    WHERE id = p_draft_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found';
    END IF;

    SELECT student_id INTO essay_owner
    FROM public.essays
    WHERE id = selected_draft.essay_id;

    IF p_student_id IS NULL
       OR essay_owner IS DISTINCT FROM p_student_id
    THEN
        RAISE EXCEPTION 'Only the essay owner can request grading';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.assessments
        WHERE draft_id = p_draft_id
    ) THEN
        RETURN jsonb_build_object(
            'status', 'already_graded'
        );
    END IF;

    IF selected_draft.status = 'grading'
       AND selected_draft.grading_started_at >
           clock_timestamp() - make_interval(secs => p_lease_seconds)
    THEN
        RETURN jsonb_build_object(
            'status', 'busy'
        );
    END IF;

    attempt_id := gen_random_uuid();

    UPDATE public.drafts
    SET status = 'grading',
        error_message = NULL,
        grading_started_at = clock_timestamp(),
        grading_attempt_id = attempt_id
    WHERE id = p_draft_id;

    RETURN jsonb_build_object(
        'status', 'claimed',
        'attempt_id', attempt_id
    );
END;
$$;


-- ==================================================
-- Save a validated assessment and complete grading
-- ==================================================

CREATE OR REPLACE FUNCTION public.complete_grading(
    p_draft_id uuid,
    p_attempt_id uuid,
    p_result jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    selected_draft public.drafts%ROWTYPE;
    rubric_categories jsonb;
    category jsonb;
    matching_scores jsonb;
    score_item jsonb;
    earned numeric := 0;
    maximum numeric := 0;
    points numeric;
    category_max numeric;
    assessment_id uuid;
BEGIN
    SELECT * INTO selected_draft
    FROM public.drafts
    WHERE id = p_draft_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Draft not found';
    END IF;

    IF p_attempt_id IS NULL
       OR selected_draft.status <> 'grading'
       OR selected_draft.grading_attempt_id IS DISTINCT FROM p_attempt_id
    THEN
        RAISE EXCEPTION 'Grading attempt has been replaced or completed';
    END IF;

    IF jsonb_typeof(p_result) IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_result -> 'category_scores')
           IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_result -> 'model')
           IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_result -> 'prompt_version')
           IS DISTINCT FROM 'string'
       OR length(trim(p_result ->> 'model')) = 0
       OR length(trim(p_result ->> 'prompt_version')) = 0
    THEN
        RAISE EXCEPTION 'Invalid assessment result';
    END IF;

    SELECT rubric_snapshot_json -> 'categories'
    INTO rubric_categories
    FROM public.essays
    WHERE id = selected_draft.essay_id;

    IF jsonb_array_length(p_result -> 'category_scores')
       <> jsonb_array_length(rubric_categories)
    THEN
        RAISE EXCEPTION 'Every rubric category needs exactly one score';
    END IF;

    FOR category IN
        SELECT value
        FROM jsonb_array_elements(rubric_categories)
    LOOP
        SELECT jsonb_agg(value) INTO matching_scores
        FROM jsonb_array_elements(p_result -> 'category_scores')
        WHERE value ->> 'category_id' = category ->> 'id';

        IF matching_scores IS NULL
           OR jsonb_array_length(matching_scores) <> 1
        THEN
            RAISE EXCEPTION 'Missing or duplicate category score';
        END IF;

        score_item := matching_scores -> 0;

        IF jsonb_typeof(score_item -> 'score')
               IS DISTINCT FROM 'number'
           OR jsonb_typeof(score_item -> 'reason')
               IS DISTINCT FROM 'string'
           OR length(trim(score_item ->> 'reason'))
               NOT BETWEEN 1 AND 3000
        THEN
            RAISE EXCEPTION 'Invalid category score or explanation';
        END IF;

        points := (score_item ->> 'score')::numeric;
        category_max := (category ->> 'max_points')::numeric;

        IF points < 0 OR points > category_max THEN
            RAISE EXCEPTION 'Category score is outside its allowed range';
        END IF;

        earned := earned + points;
        maximum := maximum + category_max;
    END LOOP;

    earned := round(earned, 2);
    maximum := round(maximum, 2);

    -- Recompute totals instead of trusting supplied totals.
    p_result := p_result || jsonb_build_object(
        'total_score', earned,
        'max_score', maximum
    );

    INSERT INTO public.assessments (
        draft_id,
        model,
        prompt_version,
        result_json,
        total_score,
        max_score
    )
    VALUES (
        p_draft_id,
        p_result ->> 'model',
        p_result ->> 'prompt_version',
        p_result,
        earned,
        maximum
    )
    RETURNING id INTO assessment_id;

    UPDATE public.drafts
    SET status = 'graded',
        error_message = NULL,
        grading_started_at = NULL,
        grading_attempt_id = NULL
    WHERE id = p_draft_id;

    UPDATE public.essays
    SET updated_at = now()
    WHERE id = selected_draft.essay_id;

    RETURN assessment_id;
END;
$$;


-- ==================================================
-- Record failure without overwriting a newer attempt
-- ==================================================

CREATE OR REPLACE FUNCTION public.fail_grading(
    p_draft_id uuid,
    p_attempt_id uuid,
    p_message text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    affected integer;
BEGIN
    UPDATE public.drafts
    SET status = 'failed',
        error_message = left(
            coalesce(
                nullif(trim(p_message), ''),
                'Grading failed. Please retry.'
            ),
            1000
        ),
        grading_started_at = NULL,
        grading_attempt_id = NULL
    WHERE id = p_draft_id
      AND status = 'grading'
      AND grading_attempt_id = p_attempt_id;

    GET DIAGNOSTICS affected = ROW_COUNT;

    RETURN affected = 1;
END;
$$;


-- These functions use trusted backend inputs.
-- They must never be callable directly by signed-in browser users.
REVOKE ALL ON FUNCTION public.claim_grading(uuid, uuid, integer)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.complete_grading(uuid, uuid, jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.fail_grading(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_grading(uuid, uuid, integer)
TO service_role;

GRANT EXECUTE ON FUNCTION public.complete_grading(uuid, uuid, jsonb)
TO service_role;

GRANT EXECUTE ON FUNCTION public.fail_grading(uuid, uuid, text)
TO service_role;

COMMIT;