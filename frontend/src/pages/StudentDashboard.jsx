import { Link } from "react-router-dom";
import { FileText, Plus, RefreshCw } from "lucide-react";

import { useApp } from "../context/AppContext";
import StatusMessage from "../components/StatusMessage";

const STATUS_LABELS = {
  submitted: "Draft saved",
  grading: "Grading in progress",
  graded: "AI feedback ready",
  failed: "Grading failed",
};

function formatScore(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "Unavailable";
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function StudentDashboard() {
  const {
    essays,
    essaysLoading,
    essaysError,
    refreshEssays,
  } = useApp();

  return (
    <div className="page student-dashboard">
      <div className="page-heading">
        <div>
          <h1>My essays</h1>

          <p className="muted">
            Continue a draft, review feedback, or start a new essay.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={refreshEssays}
            disabled={essaysLoading}
          >
            <RefreshCw
              size={18}
              className={essaysLoading ? "spin" : undefined}
              aria-hidden="true"
            />
            {essaysLoading ? "Refreshing…" : "Refresh"}
          </button>

          <Link
            to="/essays/new"
            className="button button--primary"
          >
            <Plus size={18} aria-hidden="true" />
            New essay
          </Link>
        </div>
      </div>

      <p className="muted">
    Only your essays appear here. An assigned teacher can review
    the essays you submit to them.
    </p>

      {essaysError && (
        <StatusMessage
          type="error"
          title="Could not refresh essays"
          message={essaysError}
          onRetry={refreshEssays}
          retrying={essaysLoading}
        >
          {essays.length > 0 && (
            <p className="muted">
              Previously loaded essays remain visible below.
            </p>
          )}
        </StatusMessage>
      )}

      {essaysLoading && essays.length === 0 && (
        <StatusMessage
          type="loading"
          title="Loading essays"
          message="Getting your saved drafts and assessments."
        />
      )}

      {!essaysLoading &&
        !essaysError &&
        essays.length === 0 && (
          <StatusMessage
            type="empty"
            title="Start your first essay"
            message={
              "Choose a rubric, save your writing, and request " +
              "feedback before revising."
            }
          >
            <Link
              to="/essays/new"
              className="button button--primary"
            >
              <Plus size={18} aria-hidden="true" />
              Create an essay
            </Link>
          </StatusMessage>
        )}

      <div className="essay-grid">
        {essays.map((essay) => {
          const draft = essay.latest_draft;
          const assessment = draft?.assessment;
          const review = assessment?.latest_teacher_review;

          const essayPath = `/essays/${encodeURIComponent(
            essay.id,
          )}`;

          return (
            <article className="essay-card" key={essay.id}>
              <div className="essay-card__heading">
                <FileText size={24} aria-hidden="true" />

                <span className="badge">
                  {draft
                    ? STATUS_LABELS[draft.status] || "Saved"
                    : "No drafts yet"}
                </span>
              </div>

              <h2>
                <Link to={essayPath}>{essay.title}</Link>
              </h2>

              <p className="essay-card__student">
                {essay.student_name}
              </p>

              <p className="muted">
                {essay.rubric.name}
              </p>

              <dl className="essay-card__details">
                <div>
                  <dt>Drafts</dt>
                  <dd>{essay.draft_count}</dd>
                </div>

                <div>
                  <dt>Latest AI score</dt>
                  <dd>
                    {assessment
                      ? `${formatScore(
                          assessment.total_score,
                        )} / ${formatScore(
                          assessment.max_score,
                        )}`
                      : "Not graded"}
                  </dd>
                </div>

                {review && (
                  <div>
                    <dt>Teacher-reviewed score</dt>
                    <dd>
                      {formatScore(review.total_score)} /{" "}
                      {formatScore(review.max_score)}
                    </dd>
                  </div>
                )}
              </dl>

              {draft?.status === "failed" && (
                <p className="essay-card__notice">
                  Your draft is saved. Open the essay to retry grading.
                </p>
              )}

              <p className="muted">
                Updated {formatDate(essay.updated_at)}
              </p>

              <div className="card-actions">
                <Link
                  to={essayPath}
                  className="button button--primary"
                >
                  {draft ? "Open essay" : "Write first draft"}
                </Link>

                {essay.draft_count >= 2 && (
                  <Link
                    to={`${essayPath}/revisions`}
                    className="button button--secondary"
                  >
                    Compare drafts
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}