DO $$
DECLARE
    selected_teacher uuid := 'REPLACE_WITH_TEACHER_USER_UUID';
    selected_student uuid := 'REPLACE_WITH_STUDENT_USER_UUID';
BEGIN
    IF selected_teacher = selected_student THEN
        RAISE EXCEPTION 'Teacher and student must be different accounts';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = selected_teacher
    ) THEN
        RAISE EXCEPTION 'Teacher profile not found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE id = selected_student
          AND role = 'student'
    ) THEN
        RAISE EXCEPTION 'Student profile not found or account is not a student';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM auth.users
        WHERE id = selected_teacher
          AND email_confirmed_at IS NOT NULL
    ) OR NOT EXISTS (
        SELECT 1
        FROM auth.users
        WHERE id = selected_student
          AND email_confirmed_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Confirm both email addresses first';
    END IF;

    UPDATE public.profiles
    SET role = 'teacher'
    WHERE id = selected_teacher;

    INSERT INTO public.teacher_students (
        teacher_id,
        student_id
    )
    VALUES (
        selected_teacher,
        selected_student
    )
    ON CONFLICT (teacher_id, student_id) DO NOTHING;
END;
$$;