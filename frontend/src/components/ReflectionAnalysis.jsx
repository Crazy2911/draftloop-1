import { useState } from "react";
import { Sparkles } from "lucide-react";

import { api } from "../services/api";
import StatusMessage from "./StatusMessage";

function ListSection({ title, items }) {
  if (!items?.length) {
    return null;
  }

  return (
    <section className="reflection-analysis__section">
      <h4>{title}</h4>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function ReflectionAnalysis({
  draftId,
  initialAnalysis = null,
}) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!draftId || loading) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await api.analyzeReflection(draftId);
      setAnalysis(result.analysis);
    } catch (requestError) {
      setError(
        requestError?.message ||
          "Reflection analysis could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card reflection-analysis">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Learning check</p>
          <h3>Did your revision address the feedback?</h3>
        </div>

        <button
          type="button"
          className="button button--secondary"
          onClick={handleAnalyze}
          disabled={loading || !draftId}
        >
          <Sparkles size={17} aria-hidden="true" />
          {loading ? "Analyzing…" : "Analyze reflection"}
        </button>
      </div>

      {error && (
        <StatusMessage
          type="error"
          title="Reflection analysis failed"
          message={error}
        />
      )}

      {!analysis && !loading && !error && (
        <p className="muted">
          Save a reflection with your draft, then analyze what you learned
          from the feedback.
        </p>
      )}

      {analysis && (
        <div className="reflection-analysis__content">
          <p className="reflection-analysis__summary">
            {analysis.learning_summary}
          </p>

          <ListSection
            title="What you understood"
            items={analysis.understood}
          />

          <ListSection
            title="Feedback you applied"
            items={analysis.feedback_applied}
          />

          <ListSection
            title="Gaps remaining"
            items={analysis.gaps_remaining}
          />

          <div className="reflection-analysis__next">
            <strong>Next action</strong>
            <p>{analysis.next_action}</p>
          </div>
        </div>
      )}
    </section>
  );
}