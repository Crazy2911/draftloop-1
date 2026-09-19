import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { api, isCancelled } from "../services/api";
import { useApp } from "../context/AppContext";
import ProgressChart from "../components/ProgressChart";
import StatusMessage from "../components/StatusMessage";

function EssayProgress({ essayId }) {
    const { isStudent } = useApp();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const controllerRef = useRef(null);

  const loadProgress = useCallback(async () => {
    controllerRef.current?.abort();

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await api.getProgress(essayId, {
        signal: controller.signal,
      });

      if (
        !controller.signal.aborted &&
        controllerRef.current === controller
      ) {
        setProgress(result);
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
    void loadProgress();

    return () => controllerRef.current?.abort();
  }, [loadProgress]);

  const essayPath = `/essays/${encodeURIComponent(essayId)}`;

  return (
    <section className="progress-results">
      <div className="page-actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={loadProgress}
          disabled={loading}
        >
          <RefreshCw
            size={18}
            className={loading ? "spin" : undefined}
            aria-hidden="true"
          />
          {loading ? "Refreshing…" : "Refresh scores"}
        </button>

        <Link
  to={isStudent ? essayPath : "/teacher"}
  className="button button--secondary"
>
  {isStudent ? "Open essay" : "Back to teacher review"}
</Link>

        {progress?.points.length >= 2 && (
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
          title="Could not refresh progress"
          message={error}
          onRetry={loadProgress}
          retrying={loading}
        >
          {progress && (
            <p className="muted">
              Previously loaded scores remain visible below.
            </p>
          )}
        </StatusMessage>
      )}

      {loading && !progress && (
        <StatusMessage
          type="loading"
          title="Loading progress"
          message="Getting scores from this essay’s saved drafts."
        />
      )}

      {progress && (
        <div className="panel">
          <ProgressChart progress={progress} />
        </div>
      )}
    </section>
  );
}

export default function ProgressPage() {
  const {
    isStudent,
    essays,
    essaysLoading,
    essaysError,
    refreshEssays,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();

  const requestedId = searchParams.get("essayId");

  // Respect an explicit URL selection, even if it is not in the list.
  const selectedId = requestedId || essays[0]?.id || "";

  const selectedEssay = essays.find(
    (essay) => essay.id === selectedId,
  );

  function handleSelection(event) {
    const nextParams = new URLSearchParams(searchParams);

    if (event.target.value) {
      nextParams.set("essayId", event.target.value);
    } else {
      nextParams.delete("essayId");
    }

    setSearchParams(nextParams);
  }

  return (
    <div className="page progress-page">
      <div className="page-heading">
        <div>
          <h1>Writing progress</h1>

          <p className="muted">
            Follow score changes across drafts of the same essay.
          </p>
        </div>
      </div>

      {essaysError && (
        <StatusMessage
          type="error"
          title="Could not refresh the essay list"
          message={essaysError}
          onRetry={refreshEssays}
          retrying={essaysLoading}
        />
      )}

      {essaysLoading && essays.length === 0 && !requestedId && (
        <StatusMessage
          type="loading"
          title="Loading essays"
        />
      )}

      {!essaysLoading &&
        !essaysError &&
        essays.length === 0 &&
        !requestedId && (
          <StatusMessage
  type="empty"
  title={isStudent ? "No essays yet" : "No assigned essays yet"}
  message={
    isStudent
      ? "Create an essay and grade a draft to start tracking progress."
      : "Progress will appear when your assigned students submit essays to you."
  }
>
  {isStudent && (
    <Link
      to="/essays/new"
      className="button button--primary"
    >
      Create an essay
    </Link>
  )}
</StatusMessage>
        )}

      {(essays.length > 0 || requestedId) && (
        <div className="panel">
          <label className="form-field">
            <span>Essay</span>

            <select
              value={selectedId}
              onChange={handleSelection}
            >
              {requestedId && !selectedEssay && (
                <option value={requestedId}>
                  Essay selected from link
                </option>
              )}

              {essays.map((essay) => (
                <option key={essay.id} value={essay.id}>
                  {essay.title} — {essay.student_name}
                </option>
              ))}
            </select>
          </label>

          <p className="muted">
            Each essay uses its own saved rubric. Scores from
            different rubrics are not combined into one trend.
          </p>
        </div>
      )}

      {selectedId && (
        <EssayProgress
          key={selectedId}
          essayId={selectedId}
        />
      )}
    </div>
  );
}