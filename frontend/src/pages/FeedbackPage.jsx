import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Link, useParams } from "react-router-dom";
import { RefreshCw, Sparkles } from "lucide-react";

import { api, isCancelled } from "../services/api";
import { useApp } from "../context/AppContext";
import InlineFeedback from "../components/InlineFeedback";
import ScoreBreakdown from "../components/ScoreBreakdown";
import StatusMessage from "../components/StatusMessage";

function FeedbackWorkspace({ essayId, draftId }) {
  const {
  health,
  refreshEssays,
  isStudent,
} = useApp();

  const [essay, setEssay] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState(null);

  const mountedRef = useRef(false);
  const loadControllerRef = useRef(null);
  const gradeControllerRef = useRef(null);
  const gradingRef = useRef(false);

  const loadDraft = useCallback(async () => {
    loadControllerRef.current?.abort();

    const controller = new AbortController();
    loadControllerRef.current = controller;

    setLoading(true);
    setLoadError(null);

    try {
      // One essay request gives us its rubric and saved draft history.
      const savedEssay = await api.getEssay(essayId, {
        signal: controller.signal,
      });

      const savedDraft = savedEssay.drafts.find(
        (item) => item.id === draftId,
      );

      if (!savedDraft) {
        throw new Error("This draft does not belong to this essay.");
      }

      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        loadControllerRef.current !== controller
      ) {
        return null;
      }

      setEssay(savedEssay);
      setDraft(savedDraft);

      if (savedDraft.assessment) {
        setGradeError(null);
      }

      return savedDraft;
    } catch (error) {
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        loadControllerRef.current === controller &&
        !isCancelled(error)
      ) {
        setLoadError(error);
      }

      return null;
    } finally {
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        loadControllerRef.current === controller
      ) {
        setLoading(false);
      }
    }
  }, [essayId, draftId]);

  useEffect(() => {
    mountedRef.current = true;
    void loadDraft();

    return () => {
      mountedRef.current = false;
      loadControllerRef.current?.abort();
      gradeControllerRef.current?.abort();
    };
  }, [loadDraft]);

  async function handleGrade() {
    if (
        !isStudent ||
      !draft ||
      draft.assessment ||
      gradingRef.current ||
      loading ||
      loadError
    ) {
      return;
    }

    gradingRef.current = true;
    setGrading(true);
    setGradeError(null);

    const controller = new AbortController();
    gradeControllerRef.current = controller;

    try {
      const savedDraft = await api.gradeDraft(draftId, {
        signal: controller.signal,
      });

      if (!mountedRef.current || controller.signal.aborted) {
        return;
      }

      setDraft(savedDraft);
      void refreshEssays();
    } catch (error) {
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        isCancelled(error)
      ) {
        return;
      }

      setGradeError(error);

      // A response can be lost even if grading completed on the backend.
      // Read the saved state; do not automatically repeat the POST.
      await loadDraft();

      if (mountedRef.current) {
        void refreshEssays();
      }
    } finally {
      gradingRef.current = false;

      if (gradeControllerRef.current === controller) {
        gradeControllerRef.current = null;
      }

      if (mountedRef.current) {
        setGrading(false);
      }
    }
  }

  const essayPath = `/essays/${encodeURIComponent(essayId)}`;
  const backPath = isStudent ? essayPath : "/teacher";

    const backLabel = isStudent
    ? "Back to essay"
    : "Back to teacher review";

  if (!essay || !draft) {
    return (
      <div className="page">
        <Link to={backPath}>{backLabel}</Link>

        {loadError ? (
          <StatusMessage
            type="error"
            title="Could not load draft"
            message={loadError}
            onRetry={loadDraft}
            retrying={loading}
          />
        ) : (
          <StatusMessage
            type="loading"
            title="Loading saved draft"
          />
        )}
      </div>
    );
  }

  const assessment = draft.assessment;
  const serverGrading = draft.status === "grading";
  const missingKey = health?.ai_configured === false;

  return (
    <div className="page feedback-page">
      <div className="page-heading">
        <div>
          <Link to={backPath}>{backLabel}</Link>

          <h1>{essay.title}</h1>

          <p className="muted">
            Draft {draft.draft_number} · {essay.student_name}
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={loadDraft}
            disabled={loading || grading}
          >
            <RefreshCw
              size={18}
              className={loading ? "spin" : undefined}
              aria-hidden="true"
            />
            {loading ? "Refreshing…" : "Refresh status"}
          </button>

          {isStudent && (
            <Link
                to={essayPath}
                className="button button--secondary"
            >
                Write next draft
            </Link>
            )}

          {essay.drafts.length >= 2 && (
            <Link
              to={`${essayPath}/revisions`}
              className="button button--secondary"
            >
              Compare drafts
            </Link>
          )}
        </div>
      </div>

      {loadError && (
        <StatusMessage
          type="error"
          title="Could not confirm the latest saved state"
          message={loadError}
          onRetry={loadDraft}
          retrying={loading || grading}
        />
      )}

      {gradeError && !assessment && (
        <StatusMessage
          type="error"
          title="Grading did not complete successfully"
          message={gradeError}
        />
      )}

      {!assessment &&
        !gradeError &&
        draft.error_message && (
          <StatusMessage
            type="error"
            title="Previous grading attempt failed"
            message={draft.error_message}
          />
        )}

      {!assessment && isStudent &&(
        <section className="panel">
          <h2>Get feedback on this draft</h2>

          <p>
            Your draft is saved. Request category scores and comments
            based on its rubric.
          </p>

          <p className="muted">
            Grading sends the essay, assignment prompt, and rubric
            to Groq.
          </p>

          {grading && (
            <StatusMessage
              type="loading"
              title="Assessing your essay"
              message={
                "Checking rubric scores and the passages attached " +
                "to each comment."
              }
            />
          )}

          {serverGrading && !grading && (
            <StatusMessage
              type="info"
              title="A grading attempt is recorded as in progress"
              message={
                "Refresh to check for a result. If an earlier attempt " +
                "was interrupted, retry after about two minutes. " +
                "The backend prevents overlapping active attempts."
              }
            />
          )}

          {missingKey && (
            <StatusMessage
              type="info"
              title="Groq key needed"
              message={
                "Configure the backend key and refresh the connection " +
                "status before grading."
              }
            />
          )}

          <button
            type="button"
            className="button button--primary"
            onClick={handleGrade}
            disabled={
              grading ||
              loading ||
              Boolean(loadError) ||
              missingKey
            }
          >
            <Sparkles size={18} aria-hidden="true" />

            {grading
              ? "Grading…"
              : serverGrading
                ? "Retry interrupted grading"
                : draft.status === "failed"
                  ? "Retry grading"
                  : "Grade this draft"}
          </button>
        </section>
      )}
      {!assessment && !isStudent && (
        <StatusMessage
            type="info"
            title="Awaiting student grading"
            message={
            "The student must request AI grading before you can review " +
            "the category scores. You can read the submitted essay below."
            }
        />
        )}

      {draft.reflection && (
        <section className="panel">
          <h2>Your revision reflection</h2>
          <p className="preserve-whitespace">
            {draft.reflection}
          </p>
        </section>
      )}

      {assessment && (
        <div className="panel">
          <ScoreBreakdown
            rubric={essay.rubric}
            assessment={assessment}
          />
        </div>
      )}

      <div className="panel">
        <InlineFeedback
          content={draft.content}
          rubric={essay.rubric}
          assessment={assessment}
        />
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const { essayId, draftId } = useParams();

  return (
    <FeedbackWorkspace
      key={`${essayId}:${draftId}`}
      essayId={essayId}
      draftId={draftId}
    />
  );
}