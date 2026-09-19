import { useRef, useState } from "react";

import { api, isCancelled } from "../services/api";
import StatusMessage from "./StatusMessage";

function labelText(label) {
  if (label === "stable") return "Stable revision";
  if (label === "moderate") return "Moderate change";
  if (label === "major") return "Major change";
  if (label === "first_draft") return "First draft";
  return "Not analyzed";
}

export default function SemanticDrift({ draftId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const controllerRef = useRef(null);

  async function handleAnalyze() {
    if (!draftId || loading) return;

    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError("");

    try {
      const response = await api.analyzeSemanticDrift(draftId, {
        signal: controller.signal,
      });

      setResult(response);
    } catch (requestError) {
      if (!isCancelled(requestError)) {
        setError(
          requestError?.message ||
            "Semantic comparison could not be completed.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  if (!draftId) return null;

  return (
    <section className="card semantic-drift">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Revision intelligence</p>
          <h2>Semantic drift</h2>
        </div>

        <button
          type="button"
          className="button button--secondary"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading ? "Comparing…" : "Compare with previous draft"}
        </button>
      </div>

      <p className="muted">
        Compare how much your argument changed from the previous saved draft.
      </p>

      {error && (
        <StatusMessage
          type="error"
          title="Comparison failed"
          message={error}
        />
      )}

      {result && (
        <div className="semantic-drift__result">
          <strong>{labelText(result.drift_label)}</strong>

          {typeof result.similarity === "number" && (
            <p>
              Semantic similarity:{" "}
              <strong>
                {Math.round(result.similarity * 100)}%
              </strong>
            </p>
          )}

          <p className="muted">
            {result.message ||
              "This comparison uses the meaning of both drafts, not only matching words."}
          </p>
        </div>
      )}
    </section>
  );
}