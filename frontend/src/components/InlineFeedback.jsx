import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MessageSquare, LocateFixed } from "lucide-react";

import StatusMessage from "./StatusMessage";

const KIND_LABELS = {
  structure: "Structure",
  argument: "Argument",
  grammar: "Grammar",
  clarity: "Clarity",
  other: "Other",
};

function splitParagraphs(content) {
  // Matches the paragraph splitting used by the Python backend.
  return content
    .split(/(?:\r?\n)[ \t]*(?:\r?\n)/)
    .filter((paragraph) => paragraph.trim());
}

function findCommentRange(comment, paragraphs) {
  if (
    !Number.isInteger(comment.paragraph_index) ||
    comment.paragraph_index < 0 ||
    comment.paragraph_index >= paragraphs.length ||
    typeof comment.quote !== "string" ||
    !comment.quote.trim()
  ) {
    return null;
  }

  const occurrence = comment.occurrence ?? 0;

  if (!Number.isInteger(occurrence) || occurrence < 0) {
    return null;
  }

  const paragraph = paragraphs[comment.paragraph_index];

  let searchFrom = 0;
  let start = -1;

  // Count non-overlapping matches, just like the backend.
  for (let index = 0; index <= occurrence; index += 1) {
    start = paragraph.indexOf(comment.quote, searchFrom);

    if (start === -1) {
      return null;
    }

    searchFrom = start + comment.quote.length;
  }

  // These are JavaScript string offsets, suitable for slice().
  return {
    start,
    end: start + comment.quote.length,
  };
}

function paragraphSegments(text, comments) {
  const boundaries = new Set([0, text.length]);

  for (const comment of comments) {
    boundaries.add(comment.range.start);
    boundaries.add(comment.range.end);
  }

  const positions = [...boundaries].sort((a, b) => a - b);

  return positions.slice(0, -1).map((start, index) => {
    const end = positions[index + 1];

    const coveringComments = comments.filter(
      (comment) =>
        comment.range.start < end &&
        comment.range.end > start,
    );

    return {
      start,
      text: text.slice(start, end),
      commentIndexes: coveringComments.map(
        (comment) => comment.index,
      ),
    };
  });
}

export default function InlineFeedback({
  content = "",
  assessment = null,
  rubric = null,
}) {
  const headingId = useId();
  const essayId = useId();

  const [selectedIndex, setSelectedIndex] = useState(null);
  const paragraphRefs = useRef([]);

  // Derive paragraphs from the submitted text, not AI-generated text.
  const paragraphs = useMemo(
    () => splitParagraphs(content),
    [content],
  );

  const comments = useMemo(() => {
    const savedComments = assessment?.result?.comments;

    if (!Array.isArray(savedComments)) {
      return [];
    }

    return savedComments.map((comment, index) => ({
      ...comment,
      index,
      range: findCommentRange(comment, paragraphs),
    }));
  }, [assessment, paragraphs]);

  const categories = useMemo(
    () =>
      new Map(
        (rubric?.categories ?? []).map((category) => [
          category.id,
          category.name,
        ]),
      ),
    [rubric],
  );

  const renderedParagraphs = useMemo(
    () =>
      paragraphs.map((text, paragraphIndex) => {
        const attachedComments = comments.filter(
          (comment) =>
            comment.range &&
            comment.paragraph_index === paragraphIndex,
        );

        return paragraphSegments(text, attachedComments);
      }),
    [paragraphs, comments],
  );

  useEffect(() => {
    setSelectedIndex(null);
  }, [assessment?.id, content]);

  function showPassage(comment) {
    if (!comment.range) return;

    setSelectedIndex(comment.index);

    paragraphRefs.current[
      comment.paragraph_index
    ]?.scrollIntoView({
      behavior: "auto",
      block: "center",
    });
  }

  const unlocatedCount = comments.filter(
    (comment) => !comment.range,
  ).length;

  return (
    <section
      className="inline-feedback"
      aria-labelledby={headingId}
    >
      <div className="section-heading">
        <div>
          <h2 id={headingId}>Inline feedback</h2>
          <p className="muted">
            Select a comment to locate its passage in your essay.
          </p>
        </div>

        <span className="badge">
          <MessageSquare size={16} aria-hidden="true" />{" "}
          {comments.length} comments
        </span>
      </div>

      {unlocatedCount > 0 && (
        <StatusMessage
          type="error"
          title="Some passages could not be located"
          message={
            `${unlocatedCount} comments do not match this draft. ` +
            "Their text is shown without a highlight."
          }
        />
      )}

      <div className="inline-feedback__layout">
        <article
          id={essayId}
          className="annotated-essay"
          aria-label="Submitted essay with highlighted passages"
        >
          {paragraphs.length === 0 ? (
            <p className="muted">No essay text is available.</p>
          ) : (
            renderedParagraphs.map((segments, paragraphIndex) => (
              <div
                key={paragraphIndex}
                ref={(element) => {
                  paragraphRefs.current[paragraphIndex] = element;
                }}
                className="annotated-essay__paragraph"
              >
                <span
                  className="paragraph-number"
                  aria-hidden="true"
                >
                  {paragraphIndex + 1}
                </span>

                <p className="preserve-whitespace">
                  {segments.map((segment) => {
                    if (segment.commentIndexes.length === 0) {
                      return (
                        <span key={segment.start}>
                          {segment.text}
                        </span>
                      );
                    }

                    const selected =
                      segment.commentIndexes.includes(selectedIndex);

                    return (
                      <mark
                        key={segment.start}
                        className={
                          selected
                            ? "essay-highlight essay-highlight--selected"
                            : "essay-highlight"
                        }
                        title={
                          "Related comments: " +
                          segment.commentIndexes
                            .map((index) => index + 1)
                            .join(", ")
                        }
                      >
                        {segment.text}
                      </mark>
                    );
                  })}
                </p>
              </div>
            ))
          )}
        </article>

        <aside
          className="feedback-comments"
          aria-label="Essay comments"
        >
          {!assessment && (
            <StatusMessage
              type="info"
              title="Feedback not available yet"
              message="Grade this draft to receive inline comments."
            />
          )}

          {assessment && comments.length === 0 && (
            <StatusMessage
              type="empty"
              title="No inline comments"
              message={
                "Check the category explanations and revision " +
                "priorities for any whole-essay feedback."
              }
            />
          )}

          {comments.map((comment) => {
            const selected = selectedIndex === comment.index;
            const kind = KIND_LABELS[comment.kind] || "Other";

            return (
              <article
                key={comment.index}
                className={
                  selected
                    ? "feedback-comment feedback-comment--selected"
                    : "feedback-comment"
                }
              >
                <div className="feedback-comment__heading">
                  <h3>Comment {comment.index + 1}</h3>
                  <span className="badge">{kind}</span>
                </div>

                <p className="muted">
                  {categories.get(comment.category_id) ||
                    comment.category_id}
                  {" · "}
                  {comment.severity === "important"
                    ? "Important"
                    : "Suggestion"}
                </p>

                <blockquote className="preserve-whitespace">
                  {comment.quote}
                </blockquote>

                <p>{comment.message}</p>

                <div className="feedback-comment__suggestion">
                  <p className="field-label">Try this</p>
                  <p>{comment.suggestion}</p>
                </div>

                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => showPassage(comment)}
                  disabled={!comment.range}
                  aria-pressed={selected}
                  aria-controls={essayId}
                  aria-label={
                    `Show passage for comment ${comment.index + 1}`
                  }
                >
                  <LocateFixed size={16} aria-hidden="true" />
                  {comment.range
                    ? "Show passage"
                    : "Passage unavailable"}
                </button>
              </article>
            );
          })}
        </aside>
      </div>
    </section>
  );
}