import { useId } from "react";
import { ClipboardCheck } from "lucide-react";

import StatusMessage from "./StatusMessage";

function formatScore(value) {
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export default function ScoreBreakdown({
  rubric,
  assessment,
}) {
  const headingId = useId();

  if (!rubric || !assessment) {
    return (
      <StatusMessage
        type="empty"
        title="No assessment yet"
        message="Grade this draft to see its category scores and feedback."
      />
    );
  }

  const result = assessment.result;
  const categories = rubric.categories;
  const aiScores = result?.category_scores;

  const hasValidStructure =
    Array.isArray(categories) &&
    categories.length > 0 &&
    Array.isArray(aiScores) &&
    aiScores.length === categories.length &&
    new Set(categories.map((item) => item.id)).size ===
      categories.length &&
    new Set(aiScores.map((item) => item.category_id)).size ===
      aiScores.length;

  const aiByCategory = new Map(
    (Array.isArray(aiScores) ? aiScores : []).map((item) => [
      item.category_id,
      item,
    ]),
  );

  const validAIScores =
    hasValidStructure &&
    categories.every((category) => {
      const score = aiByCategory.get(category.id)?.score;

      return (
        Number.isFinite(category.max_points) &&
        category.max_points > 0 &&
        Number.isFinite(score) &&
        score >= 0 &&
        score <= category.max_points
      );
    });

  if (!validAIScores) {
    return (
      <StatusMessage
        type="error"
        title="Assessment could not be displayed"
        message="The saved scores do not match this rubric. Refresh the draft."
      />
    );
  }

  const maximum = categories.reduce(
    (sum, category) => sum + category.max_points,
    0,
  );

  const aiTotal = categories.reduce(
    (sum, category) =>
      sum + aiByCategory.get(category.id).score,
    0,
  );

  const review = assessment.latest_teacher_review;

  const reviewScores = Array.isArray(review?.category_scores)
    ? review.category_scores
    : [];

  const reviewByCategory = new Map(
    reviewScores.map((item) => [item.category_id, item]),
  );

  const validReview =
    Boolean(review) &&
    reviewScores.length === categories.length &&
    reviewByCategory.size === categories.length &&
    categories.every((category) => {
      const score = reviewByCategory.get(category.id)?.score;

      return (
        Number.isFinite(score) &&
        score >= 0 &&
        score <= category.max_points
      );
    });

  const teacherTotal = validReview
    ? categories.reduce(
        (sum, category) =>
          sum + reviewByCategory.get(category.id).score,
        0,
      )
    : null;

  return (
    <section
      className="score-breakdown"
      aria-labelledby={headingId}
    >
      <div className="section-heading">
        <div>
          <h2 id={headingId}>Score breakdown</h2>
          <p className="muted">{rubric.name}</p>
        </div>

        <span className="badge">
          {validReview ? "Teacher reviewed" : "AI assessment"}
        </span>
      </div>

      <div className="score-summary">
        <div className="score-summary__item">
          <p className="muted">AI score</p>

          <p className="score-summary__value">
            {formatScore(aiTotal)}
            <span> / {formatScore(maximum)}</span>
          </p>

          <p className="muted">
            {formatScore((aiTotal / maximum) * 100)}%
          </p>
        </div>

        {validReview && (
          <div className="score-summary__item">
            <p className="muted">Teacher-reviewed score</p>

            <p className="score-summary__value">
              {formatScore(teacherTotal)}
              <span> / {formatScore(maximum)}</span>
            </p>

            <p className="muted">
              {formatScore((teacherTotal / maximum) * 100)}%
            </p>
          </div>
        )}
      </div>

      {review && !validReview && (
        <StatusMessage
          type="error"
          title="Teacher review could not be displayed"
          message="The reviewed scores do not match this rubric."
        />
      )}

      <div className="score-categories">
        {categories.map((category) => {
          const feedback = aiByCategory.get(category.id);
          const teacherScore = validReview
            ? reviewByCategory.get(category.id)
            : null;

          const weight =
            (category.max_points / maximum) * 100;

          return (
            <article
              key={category.id}
              className="score-category"
            >
              <div className="score-category__heading">
                <h3>{category.name}</h3>

                <span>
                  {formatScore(feedback.score)} /{" "}
                  {formatScore(category.max_points)}
                </span>
              </div>

              <progress
                className="score-category__progress"
                value={feedback.score}
                max={category.max_points}
                aria-label={`${category.name}: AI score`}
                aria-valuetext={
                  `${formatScore(feedback.score)} out of ` +
                  formatScore(category.max_points)
                }
              />

              <p className="muted">
                {formatScore(weight)}% of the overall score
              </p>

              <p className="score-category__reason">
                {feedback.reason}
              </p>

              {feedback.evidence?.length > 0 && (
                <div className="score-category__evidence">
                  <p className="field-label">
                    Evidence from your essay
                  </p>

                  {feedback.evidence.map((evidence, index) => (
                    <blockquote
                      key={`${evidence.paragraph_index}-${index}`}
                    >
                      <p className="preserve-whitespace">
                        {evidence.quote}
                      </p>

                      <footer className="muted">
                        Paragraph {evidence.paragraph_index + 1}
                      </footer>
                    </blockquote>
                  ))}
                </div>
              )}

              <details className="rubric-expectations">
                <summary>Rubric expectations</summary>
                <p>{category.description}</p>
              </details>

              {teacherScore && (
                <div className="teacher-score">
                  <p>
                    <strong>Teacher score:</strong>{" "}
                    {formatScore(teacherScore.score)} /{" "}
                    {formatScore(category.max_points)}
                  </p>

                  <p>{teacherScore.reason}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {result.overall_feedback && (
        <div className="feedback-summary">
          <h3>Overall feedback</h3>
          <p>{result.overall_feedback}</p>
        </div>
      )}

      {result.strengths?.length > 0 && (
        <div className="feedback-summary">
          <h3>What is working well</h3>
          <ul>
            {result.strengths.map((strength, index) => (
              <li key={index}>{strength}</li>
            ))}
          </ul>
        </div>
      )}

      {result.next_steps?.length > 0 && (
        <div className="feedback-summary">
          <h3>Next revision priorities</h3>
          <ol>
            {result.next_steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {validReview && (
        <div className="teacher-review-summary">
          <h3>
            <ClipboardCheck size={20} aria-hidden="true" />{" "}
            Teacher review
          </h3>
          <p>Reviewed by {review.teacher_name}</p>
          <p>{review.reason}</p>
        </div>
      )}
    </section>
  );
}