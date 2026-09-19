import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useApp } from "../context/AppContext";

import { Link, useParams } from "react-router-dom";
import { GitCompareArrows } from "lucide-react";

import { api, isCancelled } from "../services/api";
import DraftComparison from "../components/DraftComparison";
import StatusMessage from "../components/StatusMessage";

function RevisionWorkspace({ essayId }) {
    const { isStudent } = useApp();
  const [essay, setEssay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [olderId, setOlderId] = useState("");
  const [newerId, setNewerId] = useState("");

  const [comparison, setComparison] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState(null);

  const loadControllerRef = useRef(null);
  const compareControllerRef = useRef(null);
  const comparingRef = useRef(false);

  const loadEssay = useCallback(async () => {
    loadControllerRef.current?.abort();

    const controller = new AbortController();
    loadControllerRef.current = controller;

    setLoading(true);
    setLoadError(null);

    try {
      const savedEssay = await api.getEssay(essayId, {
        signal: controller.signal,
      });

      if (
        controller.signal.aborted ||
        loadControllerRef.current !== controller
      ) {
        return;
      }

      setEssay(savedEssay);

      const drafts = [...savedEssay.drafts].sort(
        (a, b) => a.draft_number - b.draft_number,
      );

      // Start with the two most recent drafts.
      if (drafts.length >= 2) {
        setOlderId(drafts[drafts.length - 2].id);
        setNewerId(drafts[drafts.length - 1].id);
      } else {
        setOlderId("");
        setNewerId("");
      }

      setComparison(null);
      setCompareError(null);
    } catch (error) {
      if (
        !controller.signal.aborted &&
        loadControllerRef.current === controller &&
        !isCancelled(error)
      ) {
        setLoadError(error);
      }
    } finally {
      if (
        !controller.signal.aborted &&
        loadControllerRef.current === controller
      ) {
        setLoading(false);
      }
    }
  }, [essayId]);

  useEffect(() => {
    void loadEssay();

    return () => {
      loadControllerRef.current?.abort();
      compareControllerRef.current?.abort();
    };
  }, [loadEssay]);

  function clearComparison() {
    compareControllerRef.current?.abort();
    compareControllerRef.current = null;
    comparingRef.current = false;

    setComparison(null);
    setCompareError(null);
    setComparing(false);
  }

  function changeOlder(event) {
    clearComparison();
    setOlderId(event.target.value);
  }

  function changeNewer(event) {
    clearComparison();
    setNewerId(event.target.value);
  }

  async function handleCompare(event) {
    event.preventDefault();

    if (comparingRef.current || !essay) return;

    const older = essay.drafts.find(
      (draft) => draft.id === olderId,
    );

    const newer = essay.drafts.find(
      (draft) => draft.id === newerId,
    );

    if (
      !older ||
      !newer ||
      older.draft_number >= newer.draft_number
    ) {
      setCompareError(
        new Error(
          "Select an older draft first and a later draft second.",
        ),
      );
      return;
    }

    compareControllerRef.current?.abort();

    const controller = new AbortController();
    compareControllerRef.current = controller;
    comparingRef.current = true;

    setComparing(true);
    setCompareError(null);
    setComparison(null);

    try {
      const result = await api.compareDrafts(
        essayId,
        olderId,
        newerId,
        { signal: controller.signal },
      );

      if (
        !controller.signal.aborted &&
        compareControllerRef.current === controller
      ) {
        setComparison(result);
      }
    } catch (error) {
      if (
        !controller.signal.aborted &&
        compareControllerRef.current === controller &&
        !isCancelled(error)
      ) {
        setCompareError(error);
      }
    } finally {
      if (compareControllerRef.current === controller) {
        comparingRef.current = false;

        if (!controller.signal.aborted) {
          setComparing(false);
        }
      }
    }
  }

  const essayPath = `/essays/${encodeURIComponent(essayId)}`;
  const backPath = isStudent ? essayPath : "/teacher";

const backLabel = isStudent
  ? "Back to essay"
  : "Back to teacher review";

  if (!essay) {
    return (
      <div className="page">
        <Link to={backPath}>{backLabel}</Link>

        {loadError ? (
          <StatusMessage
            type="error"
            title="Could not load draft history"
            message={loadError}
            onRetry={loadEssay}
            retrying={loading}
          />
        ) : (
          <StatusMessage
            type="loading"
            title="Loading draft history"
          />
        )}
      </div>
    );
  }

  const drafts = [...essay.drafts].sort(
    (a, b) => a.draft_number - b.draft_number,
  );

  const olderDraft = drafts.find(
    (draft) => draft.id === olderId,
  );

  const newerDraft = drafts.find(
    (draft) => draft.id === newerId,
  );

  const validSelection =
    Boolean(olderDraft) &&
    Boolean(newerDraft) &&
    olderDraft.draft_number < newerDraft.draft_number;

  return (
    <div className="page revision-page">
      <div className="page-heading">
        <div>
          <Link to={backPath}>{backLabel}</Link>
          <h1>Compare revisions</h1>
          <p className="muted">{essay.title}</p>
        </div>
      </div>

      {drafts.length < 2 ? (
        <StatusMessage
  type="empty"
  title="A second draft is needed"
  message={
    isStudent
      ? "Save another draft of this essay to compare text, scores, and feedback."
      : "The student needs to submit another draft before a comparison is available."
  }
>
  <Link
    to={backPath}
    className="button button--primary"
  >
    {isStudent ? "Write another draft" : "Back to teacher review"}
  </Link>
</StatusMessage>
      ) : (
        <>
          <form
            className="panel"
            onSubmit={handleCompare}
            aria-busy={comparing}
          >
            <div className="form-grid">
              <label className="form-field">
                <span>Older draft</span>

                <select
                  value={olderId}
                  onChange={changeOlder}
                  required
                >
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      Draft {draft.draft_number}
                      {draft.assessment
                        ? " — graded"
                        : " — not graded"}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Newer draft</span>

                <select
                  value={newerId}
                  onChange={changeNewer}
                  required
                >
                  {drafts.map((draft) => (
                    <option key={draft.id} value={draft.id}>
                      Draft {draft.draft_number}
                      {draft.assessment
                        ? " — graded"
                        : " — not graded"}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {!validSelection && (
              <p className="muted">
                The second selection must be a later draft.
              </p>
            )}

            <p className="muted">
              Text differences are available before grading.
              Grade both drafts to compare their AI scores.
            </p>

            <button
              type="submit"
              className="button button--primary"
              disabled={!validSelection || comparing}
            >
              <GitCompareArrows size={18} aria-hidden="true" />
              {comparing ? "Comparing…" : "Compare drafts"}
            </button>
          </form>

          {compareError && (
            <StatusMessage
              type="error"
              title="Comparison could not be loaded"
              message={compareError}
            />
          )}

          {comparing && (
            <StatusMessage
              type="loading"
              title="Comparing selected drafts"
            />
          )}

          {comparison && (
            <div className="panel">
              <DraftComparison comparison={comparison} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RevisionPage() {
  const { essayId } = useParams();

  return (
    <RevisionWorkspace
      key={essayId}
      essayId={essayId}
    />
  );
}