import TeacherNotifications from "../components/TeacherNotifications";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Link } from "react-router-dom";

import { api, isCancelled } from "../services/api";
import { useApp } from "../context/AppContext";
import ScoreBreakdown from "../components/ScoreBreakdown";
import StatusMessage from "../components/StatusMessage";

function scoreText(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "Not graded";
}

function TeacherReviewForm({
  rubric,
  assessment,
  onSaved,
}) {
  const latestReview = assessment.latest_teacher_review;

  const initialScores =
    latestReview?.category_scores ??
    assessment.result.category_scores;

  const { profile } = useApp();
  const [reason, setReason] = useState("");

  const [scores, setScores] = useState(() =>
    rubric.categories.map((category) => {
      const existing = initialScores.find(
        (item) => item.category_id === category.id,
      );

      return {
        category_id: category.id,
        score: String(existing?.score ?? ""),
        reason: existing?.reason ?? "",
      };
    }),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submittingRef = useRef(false);

  function updateScore(index, field, value) {
    setScores((current) =>
      current.map((item, position) =>
        position === index
          ? { ...item, [field]: value }
          : item,
      ),
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setError(null);

    if (!reason.trim()) {
    setError("Enter an overall review explanation.");
    return;
    }

    const categoryScores = scores.map((item) => ({
      category_id: item.category_id,
      score: Number(item.score),
      reason: item.reason.trim(),
    }));

    const invalid = categoryScores.some((item, index) => {
      const maximum = rubric.categories[index].max_points;

      return (
        !scores[index].score.trim() ||
        !Number.isFinite(item.score) ||
        item.score < 0 ||
        item.score > maximum ||
        !item.reason
      );
    });

    if (invalid) {
      setError(
        "Every category needs a score within its allowed range " +
        "and an explanation.",
      );
      return;
    }

    submittingRef.current = true;
    setSaving(true);

    let savedReview;

    try {
      savedReview = await api.createTeacherReview(
        assessment.id,
        {
            reason: reason.trim(),
            category_scores: categoryScores,
        },
        );
    } catch (saveError) {
      setError(saveError);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }

    if (savedReview) {
      onSaved(savedReview);
    }
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={saving}>
      <h3>Save a teacher review</h3>

      <p className="muted">
        Scores start from the latest teacher review, or the AI
        assessment when no review exists. Check each explanation
        before saving.
      </p>

      {error && (
        <StatusMessage
          type="error"
          title="Review could not be saved"
          message={error}
        />
      )}

      <fieldset className="form-fieldset" disabled={saving}>
        <legend className="sr-only">Teacher review details</legend>

        <p className="muted">
        Reviewing as <strong>{profile.display_name}</strong>.
        Your account identity will be recorded with this review.
        </p>

        {rubric.categories.map((category, index) => (
          <fieldset
            key={category.id}
            className="rubric-category"
          >
            <legend>{category.name}</legend>

            <label className="form-field">
              <span>
                Reviewed score — maximum {category.max_points}
              </span>

              <input
                type="number"
                min="0"
                max={category.max_points}
                step="any"
                value={scores[index].score}
                onChange={(event) =>
                  updateScore(index, "score", event.target.value)
                }
                required
              />
            </label>

            <label className="form-field">
              <span>Category explanation</span>

              <textarea
                rows={3}
                maxLength={3000}
                value={scores[index].reason}
                onChange={(event) =>
                  updateScore(index, "reason", event.target.value)
                }
                required
              />
            </label>
          </fieldset>
        ))}

        <label className="form-field">
          <span>Overall review explanation</span>

          <textarea
            rows={4}
            maxLength={3000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain your adjustments or why you agree with the scores."
            required
          />
        </label>
      </fieldset>

      <button
        type="submit"
        className="button button--primary"
        disabled={saving}
      >
        {saving ? "Saving review…" : "Save teacher review"}
      </button>
    </form>
  );
}

function EssayReview({ essayId }) {
  const { refreshEssays } = useApp();

  const [essay, setEssay] = useState(null);
  const [draftId, setDraftId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");

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
        controller.signal.aborted ||
        controllerRef.current !== controller
      ) {
        return;
      }

      setEssay(result);

      setDraftId((current) =>
        result.drafts.some((draft) => draft.id === current)
          ? current
          : result.drafts[result.drafts.length - 1]?.id ?? "",
      );
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

  function handleSaved(review) {
    setEssay((current) => ({
      ...current,
      drafts: current.drafts.map((draft) => {
        if (draft.assessment?.id !== review.assessment_id) {
          return draft;
        }

        return {
          ...draft,
          assessment: {
            ...draft.assessment,
            latest_teacher_review: review,
            teacher_reviews: [
              ...draft.assessment.teacher_reviews,
              review,
            ],
          },
        };
      }),
    }));

    setNotice(
      "Teacher review saved. The original AI assessment is unchanged.",
    );

    void refreshEssays();
  }

  if (!essay) {
    return error ? (
      <StatusMessage
        type="error"
        title="Could not load submission"
        message={error}
        onRetry={loadEssay}
        retrying={loading}
      />
    ) : (
      <StatusMessage
        type="loading"
        title="Loading submission"
      />
    );
  }

  const draft = essay.drafts.find(
    (item) => item.id === draftId,
  );

  const assessment = draft?.assessment;
  const reviews = assessment?.teacher_reviews ?? [];
  const essayPath = `/essays/${encodeURIComponent(essayId)}`;

  return (
    <section className="panel">
      <h2>{essay.title}</h2>
      <p className="muted">{essay.student_name}</p>

      {essay.drafts.length === 0 ? (
        <StatusMessage
          type="empty"
          title="No submitted drafts"
          message="This essay has been created, but no draft is saved yet."
        />
      ) : (
        <>
          <label className="form-field">
            <span>Draft to review</span>

            <select
              value={draftId}
              onChange={(event) => {
                setDraftId(event.target.value);
                setNotice("");
              }}
            >
              {[...essay.drafts].reverse().map((item) => (
                <option key={item.id} value={item.id}>
                  Draft {item.draft_number}
                  {item.assessment ? " — graded" : " — not graded"}
                </option>
              ))}
            </select>
          </label>

          {notice && (
            <StatusMessage
              type="success"
              title="Review saved"
              message={notice}
            />
          )}

          {draft && (
            <Link
              to={`${essayPath}/drafts/${encodeURIComponent(draft.id)}`}
              className="button button--secondary"
            >
              Open essay text and inline comments
            </Link>
          )}

          {!assessment ? (
            <StatusMessage
              type="info"
              title="AI grading is needed first"
              message="Open this draft and request grading before reviewing its scores."
            />
          ) : (
            <>
              <ScoreBreakdown
                rubric={essay.rubric}
                assessment={assessment}
              />

              <TeacherReviewForm
                key={
                  `${assessment.id}:` +
                  (assessment.latest_teacher_review?.id ?? "initial")
                }
                rubric={essay.rubric}
                assessment={assessment}
                onSaved={handleSaved}
              />

              {reviews.length > 0 && (
                <details className="review-history">
                  <summary>
                    Teacher review history ({reviews.length})
                  </summary>

                  {[...reviews].reverse().map((review) => (
                    <article key={review.id}>
                      <h3>
                        {review.teacher_name} ·{" "}
                        {scoreText(review.total_score)} /{" "}
                        {scoreText(review.max_score)}
                      </h3>

                      <p className="muted">
                        {new Date(review.created_at).toLocaleString()}
                      </p>

                      <p>{review.reason}</p>

                      <ul>
                        {review.category_scores.map((score) => {
                          const category = essay.rubric.categories.find(
                            (item) => item.id === score.category_id,
                          );

                          return (
                            <li key={score.category_id}>
                              <strong>
                                {category?.name ?? score.category_id}:{" "}
                                {scoreText(score.score)}
                              </strong>
                              <p>{score.reason}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </details>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export default function TeacherDashboard() {
  const {
     profile,
    essays,
    essaysLoading,
    essaysError,
    refreshEssays,
  } = useApp();

  const [selectedId, setSelectedId] = useState("");

  return (
    <div className="page teacher-dashboard">
      <div className="page-heading">
        <div>
          <h1>Teacher review</h1>
          <p className="muted">
            Inspect submissions and record reviewed scores.
          </p>
        </div>

        <button
          type="button"
          className="button button--secondary"
          onClick={refreshEssays}
          disabled={essaysLoading}
        >
          {essaysLoading ? "Refreshing…" : "Refresh submissions"}
        </button>
      </div>
            <TeacherNotifications
        teacherId={profile?.id}
        onOpenSubmission={setSelectedId}
      />

      <p className="muted">
        Only essays assigned to your account appear here.
        Each review records your verified account and preserves previous scores.
        </p>

      {essaysError && (
        <StatusMessage
          type="error"
          title="Could not refresh submissions"
          message={essaysError}
          onRetry={refreshEssays}
          retrying={essaysLoading}
        />
      )}

      {essaysLoading && essays.length === 0 && (
        <StatusMessage type="loading" title="Loading submissions" />
      )}

      {!essaysLoading && !essaysError && essays.length === 0 && (
        <StatusMessage
          type="empty"
          title="No submissions yet"
          message="Saved student essays will appear here."
        />
      )}

      {essays.length > 0 && (
        <div
          className="table-scroll"
          role="region"
          aria-label="Student submissions"
          tabIndex={0}
        >
          <table className="data-table">
            <caption>Latest draft for each essay</caption>

            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Essay</th>
                <th scope="col">Drafts</th>
                <th scope="col">AI score</th>
                <th scope="col">Review status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>

            <tbody>
              {essays.map((essay) => {
                const assessment = essay.latest_draft?.assessment;
                const review = assessment?.latest_teacher_review;

                return (
                  <tr key={essay.id}>
                    <td>{essay.student_name}</td>
                    <th scope="row">{essay.title}</th>
                    <td>{essay.draft_count}</td>

                    <td>
                      {assessment
                        ? `${scoreText(assessment.total_score)} / ${scoreText(assessment.max_score)}`
                        : "Not graded"}
                    </td>

                    <td>
                      {review
                        ? "Teacher reviewed"
                        : assessment
                          ? "Awaiting teacher review"
                          : essay.latest_draft?.status === "grading"
                            ? "AI grading in progress"
                            : "Awaiting AI assessment"}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => setSelectedId(essay.id)}
                        aria-pressed={selectedId === essay.id}
                        aria-label={`Review ${essay.title} by ${essay.student_name}`}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <EssayReview key={selectedId} essayId={selectedId} />
      )}
    </div>
  );
}