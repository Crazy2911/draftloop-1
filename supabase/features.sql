-- DraftLoop stretch features:
-- 1. Student reflection analysis
-- 2. Teacher review notifications
-- 3. Draft semantic embeddings

create extension if not exists vector
with schema extensions;

create table if not exists public.student_reflections (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique
    references public.drafts(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  reflection_text text not null
    check (char_length(reflection_text) between 1 and 3000),
  analysis_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_reflections_student_idx
on public.student_reflections(student_id, created_at desc);

create table if not exists public.teacher_notifications (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null
    references public.profiles(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  essay_id uuid not null
    references public.essays(id) on delete cascade,
  draft_id uuid not null
    references public.drafts(id) on delete cascade,
  event_type text not null default 'draft_graded'
    check (event_type in ('draft_graded', 'teacher_review_requested')),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (teacher_id, draft_id, event_type)
);

create index if not exists teacher_notifications_teacher_idx
on public.teacher_notifications(teacher_id, read_at, created_at desc);

create table if not exists public.draft_semantic_analysis (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null unique
    references public.drafts(id) on delete cascade,
  essay_id uuid not null
    references public.essays(id) on delete cascade,
  student_id uuid not null
    references public.profiles(id) on delete cascade,
  previous_draft_id uuid
    references public.drafts(id) on delete set null,
  embedding extensions.vector(768),
  similarity numeric
    check (similarity is null or similarity between -1 and 1),
  drift_label text
    check (
      drift_label is null
      or drift_label in ('stable', 'moderate', 'major')
    ),
  analysis_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis_json) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists draft_semantic_analysis_essay_idx
on public.draft_semantic_analysis(essay_id, created_at desc);

alter table public.student_reflections enable row level security;
alter table public.teacher_notifications enable row level security;
alter table public.draft_semantic_analysis enable row level security;

drop policy if exists student_reflections_read
on public.student_reflections;

create policy student_reflections_read
on public.student_reflections
for select
to authenticated
using (
  student_id = auth.uid()
  or private.is_assigned_teacher(auth.uid(), student_id)
);

drop policy if exists teacher_notifications_read
on public.teacher_notifications;

create policy teacher_notifications_read
on public.teacher_notifications
for select
to authenticated
using (teacher_id = auth.uid());

drop policy if exists teacher_notifications_update
on public.teacher_notifications;

create policy teacher_notifications_update
on public.teacher_notifications
for update
to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

drop policy if exists draft_semantic_analysis_read
on public.draft_semantic_analysis;

create policy draft_semantic_analysis_read
on public.draft_semantic_analysis
for select
to authenticated
using (
  student_id = auth.uid()
  or private.is_assigned_teacher(auth.uid(), student_id)
);

create or replace function private.notify_teacher_after_grading()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  essay_row public.essays%rowtype;
begin
  if NEW.status = 'graded'
     and OLD.status is distinct from NEW.status then

    select *
    into essay_row
    from public.essays
    where id = NEW.essay_id;

    if essay_row.teacher_id is not null then
      insert into public.teacher_notifications (
        teacher_id,
        student_id,
        essay_id,
        draft_id,
        event_type
      )
      values (
        essay_row.teacher_id,
        essay_row.student_id,
        essay_row.id,
        NEW.id,
        'draft_graded'
      )
      on conflict (teacher_id, draft_id, event_type)
      do nothing;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists drafts_teacher_notification
on public.drafts;

create trigger drafts_teacher_notification
after update of status
on public.drafts
for each row
execute function private.notify_teacher_after_grading();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teacher_notifications'
  ) then
    alter publication supabase_realtime
    add table public.teacher_notifications;
  end if;
end;
$$;

revoke all on public.student_reflections
from anon, authenticated;

revoke all on public.teacher_notifications
from anon, authenticated;

revoke all on public.draft_semantic_analysis
from anon, authenticated;

grant select on public.student_reflections
to authenticated;

grant select, update on public.teacher_notifications
to authenticated;

grant select on public.draft_semantic_analysis
to authenticated;

grant all on public.student_reflections
to service_role;

grant all on public.teacher_notifications
to service_role;

grant all on public.draft_semantic_analysis
to service_role;