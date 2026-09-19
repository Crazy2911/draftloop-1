import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import { api, isCancelled } from "../services/api";
import { useApp } from "../context/AppContext";
import EssayEditor from "../components/EssayEditor";
import StatusMessage from "../components/StatusMessage";
function NewEssay() {
  const navigate = useNavigate();

  const {
    profile,
    rubrics,
    rubricsLoading,
    rubricsError,
    refreshRubrics,
    teachers,
    teachersLoading,
    teachersError,
    refreshTeachers,
    refreshEssays,
  } = useApp();

  const [form, setForm] = useState({
    title: "",
    assignment_prompt: "",
    rubric_id: "",
    teacher_id: "",
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submitting = useRef(false);

  const selectedRubric = rubrics.find(
    (rubric) => rubric.id === form.rubric_id,
  );

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleCreate(event) {
    event.preventDefault();

    if (submitting.current) return;

    setError(null);

    if (!form.title.trim()) {
      setError("Enter an essay title.");
      return;
    }

    if (!selectedRubric) {
      setError("Select an available rubric.");
      return;
    }

    if (
      form.teacher_id &&
      !teachers.some((teacher) => teacher.id === form.teacher_id)
    ) {
      setError(
        "The selected teacher is unavailable. Refresh the teacher list.",
      );
      return;
    }

    if (form.teacher_id && (teachersLoading || teachersError)) {
      setError(
        "Refresh the teacher list before submitting to a teacher.",
      );
      return;
    }

    submitting.current = true;
    setSaving(true);

    try {
      const essay = await api.createEssay({
        title: form.title.trim(),
        assignment_prompt: form.assignment_prompt.trim(),
        rubric_id: selectedRubric.id,
        teacher_id: form.teacher_id || null,
      });

      void refreshEssays();

      navigate(
        `/essays/${encodeURIComponent(essay.id)}`,
        { replace: true },
      );
    } catch (requestError) {
      setError(requestError);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>New essay</h1>

          <p className="muted">
            Creating an essay as {profile.display_name}.
          </p>
        </div>
      </div>

      {rubricsError && (
        <StatusMessage
          type="error"
          title="Could not load rubrics"
          message={rubricsError}
          onRetry={refreshRubrics}
          retrying={rubricsLoading}
        />
      )}

      {rubricsLoading && rubrics.length === 0 && (
        <StatusMessage
          type="loading"
          title="Loading rubrics"
        />
      )}

      {!rubricsLoading &&
        !rubricsError &&
        rubrics.length === 0 && (
          <StatusMessage
            type="empty"
            title="Create a rubric first"
            message="An essay needs a rubric before it can be submitted."
          >
            <Link
              to="/rubrics"
              className="button button--primary"
            >
              Open rubrics
            </Link>
          </StatusMessage>
        )}

      {error && (
        <StatusMessage
          type="error"
          title="Essay could not be created"
          message={error}
        />
      )}

      <form
        className="panel"
        onSubmit={handleCreate}
        aria-busy={saving}
      >
        <fieldset
          className="form-fieldset"
          disabled={saving}
        >
          <legend className="sr-only">Essay details</legend>

          <label className="form-field">
            <span>Essay title</span>

            <input
              name="title"
              value={form.title}
              onChange={updateField}
              maxLength={200}
              required
            />
          </label>

          <label className="form-field">
            <span>Assignment prompt — optional</span>

            <textarea
              name="assignment_prompt"
              value={form.assignment_prompt}
              onChange={updateField}
              maxLength={5000}
              rows={4}
              placeholder="Paste the question or teacher's instructions."
            />
          </label>

          <label className="form-field">
            <span>Grading rubric</span>

            <select
              name="rubric_id"
              value={form.rubric_id}
              onChange={updateField}
              required
            >
              <option value="">Select a rubric</option>

              {rubrics.map((rubric) => (
                <option key={rubric.id} value={rubric.id}>
                  {rubric.name}
                  {rubric.is_template ? " — template" : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedRubric && (
            <details className="rubric-expectations">
              <summary>Review selected scoring criteria</summary>

              {selectedRubric.categories.map((category) => (
                <div key={category.id}>
                  <h3>
                    {category.name} · {category.max_points} points
                  </h3>

                  <p>{category.description}</p>
                </div>
              ))}
            </details>
          )}

          {teachersError && (
            <StatusMessage
              type="error"
              title="Could not load assigned teachers"
              message={teachersError}
            />
          )}

          <label className="form-field">
            <span>Teacher review</span>

            <select
              name="teacher_id"
              value={form.teacher_id}
              onChange={updateField}
              disabled={teachersLoading}
            >
              <option value="">
                Independent practice — no teacher assigned
              </option>

              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.display_name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="button button--secondary"
            onClick={refreshTeachers}
            disabled={teachersLoading}
          >
            {teachersLoading
              ? "Loading teachers…"
              : "Refresh teachers"}
          </button>

          {!teachersLoading &&
            !teachersError &&
            teachers.length === 0 && (
              <p className="muted" style={{ marginTop: "1rem" }}>
                No teacher is assigned to your account yet.
                You can practice independently, or ask the
                administrator to assign a teacher.
              </p>
            )}

          <p className="muted" style={{ marginTop: "1rem" }}>
            The selected rubric and teacher are fixed for this essay.
            If you want teacher review, choose your assigned teacher
            before creating it.
          </p>
        </fieldset>

        <div className="form-actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={
              saving ||
              !selectedRubric ||
              Boolean(
                form.teacher_id &&
                (teachersLoading || teachersError),
              )
            }
          >
            {saving ? "Creating…" : "Create and start writing"}
          </button>

          {!saving && (
            <Link
              to="/"
              className="button button--secondary"
            >
              Cancel
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
function ExistingEssay({ essayId }) {
  const navigate = useNavigate();
  const { health, refreshEssays } = useApp();

  const [essay, setEssay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const controllerRef = useRef(null);

  const loadEssay = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await api.getEssay(essayId, {
        signal: controller.signal,
      });

      if (
        !controller.signal.aborted &&
        controllerRef.current === controller
      ) {
        setEssay(result);
      }
    } catch (requestError) {
      if (
        !controller.signal.aborted &&
        controllerRef.current === controller &&
        !isCancelled(requestError)
      ) {
        setError(requestError);
      }
    } finally {
      if (
        !controller.signal.aborted &&
        controllerRef.current === controller
      ) {
        setLoading(false);
      }
    }
  }, [essayId]);

  useEffect(() => {
    void loadEssay();

    return () => controllerRef.current?.abort();
  }, [loadEssay]);

  async function handleSaveDraft(payload) {
    const draft = await api.createDraft(essayId, payload);

    void refreshEssays();

    navigate(
      `/essays/${encodeURIComponent(essayId)}/drafts/` +
        encodeURIComponent(draft.id),
    );
  }

  if (!essay) {
    return (
      <div className="page">
        <Link to="/">Back to essays</Link>

        {error ? (
          <StatusMessage
            type="error"
            title="Could not load this essay"
            message={error}
            onRetry={loadEssay}
            retrying={loading}
          />
        ) : (
          <StatusMessage
            type="loading"
            title="Loading essay"
          />
        )}
      </div>
    );
  }

  const drafts = [...essay.drafts].sort(
    (a, b) => a.draft_number - b.draft_number,
  );

  const latestDraft = drafts[drafts.length - 1];
  const essayPath = `/essays/${encodeURIComponent(essayId)}`;

  const statusLabels = {
    submitted: "Saved",
    grading: "Grading",
    graded: "Feedback ready",
    failed: "Grading failed",
  };

  return (
    <div className="page essay-workspace">
      <div className="page-heading">
        <div>
          <Link to="/">Back to essays</Link>
          <h1>{essay.title}</h1>

          <p className="muted">
            {essay.student_name} · {essay.rubric.name}
          </p>
        </div>

        {drafts.length >= 2 && (
          <Link
            to={`${essayPath}/revisions`}
            className="button button--secondary"
          >
            Compare drafts
          </Link>
        )}
      </div>

      {error && (
        <StatusMessage
          type="error"
          title="Could not refresh the essay"
          message={error}
          onRetry={loadEssay}
          retrying={loading}
        />
      )}

      <details className="panel">
        <summary>Assignment and saved rubric</summary>

        {essay.assignment_prompt && (
          <p className="preserve-whitespace">
            {essay.assignment_prompt}
          </p>
        )}

        {essay.rubric.categories.map((category) => (
          <div key={category.id}>
            <h3>
              {category.name} · {category.max_points} points
            </h3>
            <p>{category.description}</p>
          </div>
        ))}
      </details>

      {drafts.length > 0 && (
        <section className="panel">
          <h2>Draft history</h2>

          <ul className="draft-history">
            {[...drafts].reverse().map((draft) => (
              <li key={draft.id}>
                <div>
                  <strong>Draft {draft.draft_number}</strong>

                  <p className="muted">
                    {new Date(draft.created_at).toLocaleString()}
                    {" · "}
                    {statusLabels[draft.status] || "Saved"}
                  </p>
                </div>

                <Link
                  to={
                    `${essayPath}/drafts/` +
                    encodeURIComponent(draft.id)
                  }
                  className="button button--secondary"
                >
                  Open draft {draft.draft_number}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>
          {latestDraft
            ? `Write draft ${latestDraft.draft_number + 1}`
            : "Write your first draft"}
        </h2>

        {latestDraft && (
          <p className="muted">
            The editor starts with your latest draft.
            Saving creates a separate submission.
          </p>
        )}

        <EssayEditor
          key={`${essayId}:${latestDraft?.id || "first"}`}
          initialContent={latestDraft?.content || ""}
          initialReflection=""
          maxCharacters={health?.max_essay_characters ?? 30000}
          onSave={handleSaveDraft}
        />
      </section>
    </div>
  );
}
export default function EssayWorkspace() {
  const { essayId } = useParams();

  return essayId ? (
    <ExistingEssay key={essayId} essayId={essayId} />
  ) : (
    <NewEssay />
  );
}