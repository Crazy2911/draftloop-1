import { useId } from "react";

import StatusMessage from "./StatusMessage";

function formatScore(value) {
  return Number.isFinite(value)
    ? value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })
    : "Not graded";
}

function formatDelta(value) {
  if (!Number.isFinite(value)) {
    return "Unavailable";
  }

  if (value === 0) return "No change";

  return `${value > 0 ? "+" : ""}${formatScore(value)} points`;
}

function deltaClass(value) {
  if (!Number.isFinite(value) || value === 0) {
    return "score-delta";
  }

  return value > 0
    ? "score-delta score-delta--positive"
    : "score-delta score-delta--negative";
}

function FeedbackPanel({ title, feedback }) {
  return (
    <article className="comparison-feedback">
      <h3>{title}</h3>

      {!feedback ? (
        <p className="muted">
          Grade this draft to see its feedback.
        </p>
      ) : (
        <>
          <p>{feedback.overall_feedback}</p>

          {feedback.strengths?.length > 0 && (
            <div>
              <h4>Strengths</h4>

              <ul>
                {feedback.strengths.map((strength, index) => (
                  <li key={index}>{strength}</li>
                ))}
              </ul>
            </div>
          )}

          {feedback.next_steps?.length > 0 && (
            <div>
              <h4>Revision priorities</h4>

              <ol>
                {feedback.next_steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {feedback.comments?.length > 0 && (
            <details>
              <summary>
                Inline comments ({feedback.comments.length})
              </summary>

              <div className="comparison-comment-list">
                {feedback.comments.map((comment, index) => (
                  <div
                    key={index}
                    className="comparison-comment"
                  >
                    <p className="muted">
                      Comment {index + 1} · Paragraph{" "}
                      {comment.paragraph_index + 1}
                    </p>

                    <blockquote className="preserve-whitespace">
                      {comment.quote}
                    </blockquote>

                    <p>{comment.message}</p>

                    <p>
                      <strong>Suggestion:</strong>{" "}
                      {comment.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </article>
  );
}

export default function DraftComparison({ comparison }) {
  const headingId = useId();

  if (!comparison) {
    return (
      <StatusMessage
        type="empty"
        title="Choose two drafts"
        message="Select an older draft and a newer draft to compare."
      />
    );
  }

  const {
    older_draft: older,
    newer_draft: newer,
    older_summary: olderSummary,
    newer_summary: newerSummary,
    total_delta: totalDelta,
    category_changes: categories,
    text_diff: segments,
    older_feedback: olderFeedback,
    newer_feedback: newerFeedback,
    notices = [],
  } = comparison;

  return (
    <section
      className="draft-comparison"
      aria-labelledby={headingId}
    >
      <div className="section-heading">
        <div>
          <h2 id={headingId}>
            Draft {older.draft_number} compared with draft{" "}
            {newer.draft_number}
          </h2>

          <p className="muted">
            Scores below are AI assessments using this essay’s
            saved rubric. Teacher reviews remain separate.
          </p>
        </div>
      </div>

      {notices.map((notice, index) => (
        <StatusMessage
          key={index}
          type="info"
          title="Comparison note"
          message={notice}
        />
      ))}

      <div className="score-summary">
        <div className="score-summary__item">
          <p className="muted">Draft {older.draft_number}</p>

          <p className="score-summary__value">
            {formatScore(olderSummary?.total_score)}

            {olderSummary && (
              <span>
                {" / "}
                {formatScore(olderSummary.max_score)}
              </span>
            )}
          </p>
        </div>

        <div className="score-summary__item">
          <p className="muted">Draft {newer.draft_number}</p>

          <p className="score-summary__value">
            {formatScore(newerSummary?.total_score)}

            {newerSummary && (
              <span>
                {" / "}
                {formatScore(newerSummary.max_score)}
              </span>
            )}
          </p>
        </div>

        <div className="score-summary__item">
          <p className="muted">Score change</p>

          <p className={deltaClass(totalDelta)}>
            {formatDelta(totalDelta)}
          </p>
        </div>
      </div>

      <div
        className="table-scroll"
        role="region"
        aria-label="Category score comparison"
        tabIndex={0}
      >
        <table className="data-table">
          <caption>AI scores by rubric category</caption>

          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Maximum</th>
              <th scope="col">Draft {older.draft_number}</th>
              <th scope="col">Draft {newer.draft_number}</th>
              <th scope="col">Change</th>
            </tr>
          </thead>

          <tbody>
            {categories.map((category) => (
              <tr key={category.category_id}>
                <th scope="row">{category.name}</th>

                <td>{formatScore(category.max_points)}</td>
                <td>{formatScore(category.older_score)}</td>
                <td>{formatScore(category.newer_score)}</td>

                <td className={deltaClass(category.delta)}>
                  {formatDelta(category.delta)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="comparison-reasons">
        <h3>How the category feedback changed</h3>

        {categories.map((category) => (
          <details key={category.category_id}>
            <summary>{category.name}</summary>

            <div className="comparison-columns">
              <div>
                <h4>Draft {older.draft_number}</h4>
                <p>
                  {category.older_reason ||
                    "No assessment available."}
                </p>
              </div>

              <div>
                <h4>Draft {newer.draft_number}</h4>
                <p>
                  {category.newer_reason ||
                    "No assessment available."}
                </p>
              </div>
            </div>
          </details>
        ))}
      </div>

      <section className="text-comparison">
        <h3>Exact text changes</h3>

        {!comparison.text_changed ? (
          <p className="muted">
            The essay text is identical in these drafts.
          </p>
        ) : (
          <p className="diff-legend">
            <span className="diff-legend__removed">
              Removed text is struck through.
            </span>{" "}
            <span className="diff-legend__added">
              Added text is underlined.
            </span>
          </p>
        )}

        <div
          className="text-diff preserve-whitespace"
          aria-label="Combined text showing removals and additions"
        >
          {segments.map((segment, index) => {
            if (segment.type === "delete") {
              return (
                <del key={index} className="diff-removed">
                  <span className="sr-only">
                    {"[Removed text: "}
                  </span>
                  {segment.text}
                  <span className="sr-only">{"]"}</span>
                </del>
              );
            }

            if (segment.type === "insert") {
              return (
                <ins key={index} className="diff-added">
                  <span className="sr-only">
                    {"[Added text: "}
                  </span>
                  {segment.text}
                  <span className="sr-only">{"]"}</span>
                </ins>
              );
            }

            return <span key={index}>{segment.text}</span>;
          })}
        </div>
      </section>

      <section>
        <h3>Feedback across drafts</h3>

        <div className="comparison-columns">
          <FeedbackPanel
            title={`Draft ${older.draft_number}`}
            feedback={olderFeedback}
          />

          <FeedbackPanel
            title={`Draft ${newer.draft_number}`}
            feedback={newerFeedback}
          />
        </div>
      </section>
    </section>
  );
}