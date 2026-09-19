BEGIN;

-- Internal authorization helpers are kept outside the public API schema.
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;


-- ==================================================
-- Accounts and teacher assignments
-- ==================================================

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text NOT NULL CHECK (
        length(trim(display_name)) BETWEEN 1 AND 200
    ),
    role text NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'teacher')),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Only the project administrator manages teacher/student assignments.
CREATE TABLE public.teacher_students (
    teacher_id uuid NOT NULL REFERENCES public.profiles(id),
    student_id uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (teacher_id, student_id),
    CHECK (teacher_id <> student_id)
);


CREATE FUNCTION private.is_teacher(person_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = person_id
          AND role = 'teacher'
    );
$$;


CREATE FUNCTION private.is_assigned_teacher(
    teacher uuid,
    student uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT private.is_teacher(teacher)
       AND EXISTS (
           SELECT 1
           FROM public.teacher_students
           WHERE teacher_id = teacher
             AND student_id = student
       );
$$;


-- Never use signup metadata to choose a user's role.
CREATE FUNCTION private.create_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, role)
    VALUES (
        NEW.id,
        left(
            coalesce(
                nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''),
                'Student'
            ),
            200
        ),
        'student'
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER create_profile_after_signup
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.create_profile();


-- Include accounts created before this schema was installed.
INSERT INTO public.profiles (id, display_name, role)
SELECT
    id,
    left(
        coalesce(
            nullif(trim(raw_user_meta_data ->> 'display_name'), ''),
            'Student'
        ),
        200
    ),
    'student'
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ==================================================
-- Rubrics
-- ==================================================

CREATE TABLE public.rubrics (
    id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    owner_id uuid REFERENCES public.profiles(id),
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT ''
        CHECK (length(description) <= 3000),
    categories_json jsonb NOT NULL
        CHECK (jsonb_typeof(categories_json) = 'array'),
    is_template boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CHECK (
        (is_template AND owner_id IS NULL)
        OR
        (NOT is_template AND owner_id IS NOT NULL)
    )
);


CREATE FUNCTION private.validate_rubric()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    category jsonb;
    seen_ids text[] := ARRAY[]::text[];
    seen_names text[] := ARRAY[]::text[];
    category_id text;
    category_name text;
    points numeric;
BEGIN
    IF jsonb_array_length(NEW.categories_json) NOT BETWEEN 1 AND 12 THEN
        RAISE EXCEPTION 'A rubric needs between 1 and 12 categories';
    END IF;

    FOR category IN
        SELECT value FROM jsonb_array_elements(NEW.categories_json)
    LOOP
        category_id := category ->> 'id';
        category_name := lower(trim(category ->> 'name'));

        IF jsonb_typeof(category) <> 'object'
           OR jsonb_typeof(category -> 'id') IS DISTINCT FROM 'string'
           OR jsonb_typeof(category -> 'name') IS DISTINCT FROM 'string'
           OR jsonb_typeof(category -> 'description') IS DISTINCT FROM 'string'
           OR jsonb_typeof(category -> 'max_points') IS DISTINCT FROM 'number'
        THEN
            RAISE EXCEPTION 'Invalid rubric category fields';
        END IF;

        IF category_id !~ '^[a-z][a-z0-9_-]{0,59}$'
           OR length(category_name) NOT BETWEEN 1 AND 200
           OR length(trim(category ->> 'description')) NOT BETWEEN 1 AND 3000
        THEN
            RAISE EXCEPTION 'Invalid rubric category content';
        END IF;

        IF category_id = ANY(seen_ids)
           OR category_name = ANY(seen_names)
        THEN
            RAISE EXCEPTION 'Category IDs and names must be unique';
        END IF;

        points := (category ->> 'max_points')::numeric;

        IF points <= 0 OR points > 1000 THEN
            RAISE EXCEPTION 'Category points must be between 0 and 1000';
        END IF;

        seen_ids := array_append(seen_ids, category_id);
        seen_names := array_append(seen_names, category_name);
    END LOOP;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER validate_rubric_before_write
BEFORE INSERT OR UPDATE ON public.rubrics
FOR EACH ROW EXECUTE FUNCTION private.validate_rubric();


-- ==================================================
-- Essays and immutable drafts
-- ==================================================

CREATE TABLE public.essays (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL DEFAULT auth.uid()
        REFERENCES public.profiles(id),
    teacher_id uuid REFERENCES public.profiles(id),
    student_name text NOT NULL,
    title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
    assignment_prompt text NOT NULL DEFAULT ''
        CHECK (length(assignment_prompt) <= 5000),
    rubric_id text NOT NULL REFERENCES public.rubrics(id),
    rubric_snapshot_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);


-- Read the selected rubric through the caller's RLS permissions.
CREATE FUNCTION private.prepare_essay()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    selected_rubric public.rubrics%ROWTYPE;
BEGIN
    SELECT * INTO selected_rubric
    FROM public.rubrics
    WHERE id = NEW.rubric_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rubric is unavailable';
    END IF;

    NEW.student_id := auth.uid();

    SELECT display_name INTO NEW.student_name
    FROM public.profiles
    WHERE id = NEW.student_id;

    NEW.rubric_snapshot_json := jsonb_build_object(
        'name', selected_rubric.name,
        'description', selected_rubric.description,
        'categories', selected_rubric.categories_json
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_essay_before_insert
BEFORE INSERT ON public.essays
FOR EACH ROW EXECUTE FUNCTION private.prepare_essay();


CREATE TABLE public.drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    essay_id uuid NOT NULL REFERENCES public.essays(id),
    draft_number integer NOT NULL CHECK (draft_number > 0),
    content text NOT NULL CHECK (
        length(trim(content)) > 0
        AND length(content) <= 30000
    ),
    reflection text NOT NULL DEFAULT ''
        CHECK (length(reflection) <= 3000),
    status text NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'grading', 'graded', 'failed')),
    error_message text,
    grading_started_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (essay_id, draft_number)
);


-- Serialize draft numbering by locking the parent essay.
CREATE FUNCTION private.prepare_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    essay_owner uuid;
BEGIN
    SELECT student_id INTO essay_owner
    FROM public.essays
    WHERE id = NEW.essay_id
    FOR UPDATE;

    IF NOT FOUND
       OR auth.uid() IS NULL
       OR essay_owner IS DISTINCT FROM auth.uid()
    THEN
        RAISE EXCEPTION 'Only the essay owner can submit a draft';
    END IF;

    SELECT coalesce(max(draft_number), 0) + 1
    INTO NEW.draft_number
    FROM public.drafts
    WHERE essay_id = NEW.essay_id;

    NEW.status := 'submitted';
    NEW.error_message := NULL;
    NEW.grading_started_at := NULL;

    UPDATE public.essays
    SET updated_at = now()
    WHERE id = NEW.essay_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_draft_before_insert
BEFORE INSERT ON public.drafts
FOR EACH ROW EXECUTE FUNCTION private.prepare_draft();


-- ==================================================
-- Assessments and teacher reviews
-- ==================================================

CREATE TABLE public.assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id uuid NOT NULL UNIQUE REFERENCES public.drafts(id),
    model text NOT NULL,
    prompt_version text NOT NULL,
    result_json jsonb NOT NULL
        CHECK (jsonb_typeof(result_json) = 'object'),
    total_score numeric NOT NULL CHECK (total_score >= 0),
    max_score numeric NOT NULL CHECK (max_score > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (total_score <= max_score)
);


CREATE TABLE public.teacher_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id uuid NOT NULL REFERENCES public.assessments(id),
    teacher_id uuid NOT NULL DEFAULT auth.uid()
        REFERENCES public.profiles(id),
    teacher_name text NOT NULL,
    category_scores_json jsonb NOT NULL
        CHECK (jsonb_typeof(category_scores_json) = 'array'),
    total_score numeric NOT NULL CHECK (total_score >= 0),
    max_score numeric NOT NULL CHECK (max_score > 0),
    reason text NOT NULL CHECK (
        length(trim(reason)) BETWEEN 1 AND 3000
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (total_score <= max_score)
);


CREATE FUNCTION private.prepare_teacher_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_essay public.essays%ROWTYPE;
    category jsonb;
    score_item jsonb;
    matched_scores jsonb;
    earned numeric := 0;
    maximum numeric := 0;
    points numeric;
    category_max numeric;
BEGIN
    SELECT e.* INTO target_essay
    FROM public.essays e
    JOIN public.drafts d ON d.essay_id = e.id
    JOIN public.assessments a ON a.draft_id = d.id
    WHERE a.id = NEW.assessment_id;

    IF NOT FOUND
       OR auth.uid() IS NULL
       OR target_essay.teacher_id IS DISTINCT FROM auth.uid()
       OR NOT private.is_assigned_teacher(
           auth.uid(), target_essay.student_id
       )
    THEN
        RAISE EXCEPTION 'You are not authorized to review this essay';
    END IF;

    IF jsonb_array_length(NEW.category_scores_json)
       <> jsonb_array_length(
           target_essay.rubric_snapshot_json -> 'categories'
       )
    THEN
        RAISE EXCEPTION 'Review every rubric category exactly once';
    END IF;

    FOR category IN
        SELECT value
        FROM jsonb_array_elements(
            target_essay.rubric_snapshot_json -> 'categories'
        )
    LOOP
        SELECT jsonb_agg(value) INTO matched_scores
        FROM jsonb_array_elements(NEW.category_scores_json)
        WHERE value ->> 'category_id' = category ->> 'id';

        IF matched_scores IS NULL
           OR jsonb_array_length(matched_scores) <> 1
        THEN
            RAISE EXCEPTION 'Missing or duplicate category score';
        END IF;

        score_item := matched_scores -> 0;

        IF jsonb_typeof(score_item -> 'score') IS DISTINCT FROM 'number'
           OR jsonb_typeof(score_item -> 'reason') IS DISTINCT FROM 'string'
           OR length(trim(score_item ->> 'reason')) NOT BETWEEN 1 AND 3000
        THEN
            RAISE EXCEPTION 'Invalid score or category explanation';
        END IF;

        points := (score_item ->> 'score')::numeric;
        category_max := (category ->> 'max_points')::numeric;

        IF points < 0 OR points > category_max THEN
            RAISE EXCEPTION 'Score exceeds the category range';
        END IF;

        earned := earned + points;
        maximum := maximum + category_max;
    END LOOP;

    NEW.teacher_id := auth.uid();

    SELECT display_name INTO NEW.teacher_name
    FROM public.profiles
    WHERE id = auth.uid();

    NEW.total_score := round(earned, 2);
    NEW.max_score := round(maximum, 2);

    UPDATE public.essays
    SET updated_at = now()
    WHERE id = target_essay.id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER prepare_review_before_insert
BEFORE INSERT ON public.teacher_reviews
FOR EACH ROW EXECUTE FUNCTION private.prepare_teacher_review();


-- ==================================================
-- Preserve historical records
-- ==================================================

CREATE FUNCTION private.reject_history_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Historical records cannot be overwritten';
END;
$$;

CREATE TRIGGER protect_essay_details
BEFORE UPDATE OF
    student_id, teacher_id, student_name,
    title, assignment_prompt, rubric_id, rubric_snapshot_json
ON public.essays
FOR EACH ROW EXECUTE FUNCTION private.reject_history_update();

CREATE TRIGGER protect_draft_text
BEFORE UPDATE OF
    essay_id, draft_number, content, reflection
ON public.drafts
FOR EACH ROW EXECUTE FUNCTION private.reject_history_update();

CREATE TRIGGER protect_ai_assessment
BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION private.reject_history_update();

CREATE TRIGGER protect_teacher_review
BEFORE UPDATE ON public.teacher_reviews
FOR EACH ROW EXECUTE FUNCTION private.reject_history_update();


-- ==================================================
-- Access helper
-- ==================================================

CREATE FUNCTION private.can_read_essay(target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.essays e
        WHERE e.id = target_id
          AND (
              e.student_id = auth.uid()
              OR (
                  e.teacher_id = auth.uid()
                  AND private.is_assigned_teacher(
                      auth.uid(), e.student_id
                  )
              )
          )
    );
$$;


-- ==================================================
-- Row Level Security
-- ==================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.essays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_reviews ENABLE ROW LEVEL SECURITY;


CREATE POLICY profiles_read
ON public.profiles FOR SELECT TO authenticated
USING (
    id = auth.uid()
    OR private.is_assigned_teacher(auth.uid(), id)
    OR private.is_assigned_teacher(id, auth.uid())
);

CREATE POLICY assignments_read
ON public.teacher_students FOR SELECT TO authenticated
USING (
    student_id = auth.uid()
    OR teacher_id = auth.uid()
);

CREATE POLICY rubrics_read
ON public.rubrics FOR SELECT TO authenticated
USING (
    is_template
    OR owner_id = auth.uid()
    OR private.is_assigned_teacher(owner_id, auth.uid())
);

CREATE POLICY rubrics_create
ON public.rubrics FOR INSERT TO authenticated
WITH CHECK (
    owner_id = auth.uid()
    AND NOT is_template
);

CREATE POLICY rubrics_edit
ON public.rubrics FOR UPDATE TO authenticated
USING (owner_id = auth.uid() AND NOT is_template)
WITH CHECK (owner_id = auth.uid() AND NOT is_template);

CREATE POLICY essays_read
ON public.essays FOR SELECT TO authenticated
USING (private.can_read_essay(id));

CREATE POLICY essays_create
ON public.essays FOR INSERT TO authenticated
WITH CHECK (
    student_id = auth.uid()
    AND NOT private.is_teacher(auth.uid())
    AND (
        teacher_id IS NULL
        OR private.is_assigned_teacher(teacher_id, auth.uid())
    )
);

CREATE POLICY drafts_read
ON public.drafts FOR SELECT TO authenticated
USING (private.can_read_essay(essay_id));

CREATE POLICY drafts_create
ON public.drafts FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.essays
        WHERE id = essay_id AND student_id = auth.uid()
    )
    AND status = 'submitted'
);

CREATE POLICY assessments_read
ON public.assessments FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.drafts
        WHERE id = draft_id
          AND private.can_read_essay(essay_id)
    )
);

CREATE POLICY reviews_read
ON public.teacher_reviews FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.assessments a
        JOIN public.drafts d ON d.id = a.draft_id
        WHERE a.id = assessment_id
          AND private.can_read_essay(d.essay_id)
    )
);

CREATE POLICY reviews_create
ON public.teacher_reviews FOR INSERT TO authenticated
WITH CHECK (
    teacher_id = auth.uid()
    AND private.is_teacher(auth.uid())
    -- The trigger additionally verifies the exact essay assignment.
);


-- ==================================================
-- Explicit table privileges
-- ==================================================

REVOKE ALL ON TABLE
    public.profiles,
    public.teacher_students,
    public.rubrics,
    public.essays,
    public.drafts,
    public.assessments,
    public.teacher_reviews
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
    public.profiles,
    public.teacher_students,
    public.rubrics,
    public.essays,
    public.drafts,
    public.assessments,
    public.teacher_reviews
TO authenticated;

GRANT INSERT (
    id, owner_id, name, description, categories_json
) ON public.rubrics TO authenticated;

GRANT UPDATE (
    name, description, categories_json
) ON public.rubrics TO authenticated;

GRANT INSERT (
    id, teacher_id, title, assignment_prompt, rubric_id
) ON public.essays TO authenticated;

GRANT INSERT (
    id, essay_id, content, reflection
) ON public.drafts TO authenticated;

GRANT INSERT (
    id, assessment_id, category_scores_json, reason
) ON public.teacher_reviews TO authenticated;

-- The privileged backend role is never exposed to the browser.
GRANT ALL ON TABLE
    public.profiles,
    public.teacher_students,
    public.rubrics,
    public.essays,
    public.drafts,
    public.assessments,
    public.teacher_reviews
TO service_role;


-- Trigger functions cannot be called directly by application users.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.is_teacher(uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_assigned_teacher(uuid, uuid)
TO authenticated;

GRANT EXECUTE ON FUNCTION private.can_read_essay(uuid)
TO authenticated;


-- ==================================================
-- Query indexes
-- ==================================================

CREATE INDEX essays_student_index ON public.essays(student_id);
CREATE INDEX essays_teacher_index ON public.essays(teacher_id);
CREATE INDEX rubrics_owner_index ON public.rubrics(owner_id);
CREATE INDEX assignments_student_index
    ON public.teacher_students(student_id);
CREATE INDEX drafts_status_index ON public.drafts(status);
CREATE INDEX reviews_assessment_index
    ON public.teacher_reviews(assessment_id, created_at);

COMMIT;