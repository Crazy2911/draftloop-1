import { useState } from "react";
import {
  Copy,
  Pencil,
  Plus,
  RefreshCw,
} from "lucide-react";

import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import RubricEditor from "../components/RubricEditor";
import StatusMessage from "../components/StatusMessage";

function formatPoints(value) {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export default function RubricsPage() {
  const {
    profile,
    rubrics,
    rubricsLoading,
    rubricsError,
    refreshRubrics,
  } = useApp();

  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  function openEditor(mode, rubric = null) {
    if (saving) return;

    setSuccess("");

    const initialRubric =
      mode === "copy"
        ? {
            ...rubric,
            name: `${rubric.name.slice(0, 193)} (copy)`,
          }
        : rubric;

    setEditor({
      key: crypto.randomUUID(),
      mode,
      rubric: initialRubric,
    });
  }

  async function handleSave(payload) {
    if (!editor) {
      throw new Error("Select a rubric action first.");
    }

    setSaving(true);
    setSuccess("");

    try {
      const saved =
        editor.mode === "edit"
          ? await api.updateRubric(editor.rubric.id, payload)
          : await api.createRubric(payload);

      setEditor(null);

      setSuccess(
        editor.mode === "edit"
          ? `"${saved.name}" was updated. Existing essays keep their original rubric.`
          : `"${saved.name}" was created and can now be selected for a new essay.`,
      );

      // A refresh failure is shown separately, not as a failed save.
      await refreshRubrics();
    } finally {
      setSaving(false);
    }
  }

  const templates = rubrics.filter(
    (rubric) => rubric.is_template,
  );

  const customRubrics = rubrics.filter(
    (rubric) => !rubric.is_template,
  );

  function renderRubric(rubric) {
    const total = rubric.categories.reduce(
      (sum, category) => sum + category.max_points,
      0,
    );

    return (
      <article className="rubric-card" key={rubric.id}>
        <div className="section-heading">
          <h3>{rubric.name}</h3>

          <span className="badge">
            {rubric.is_template
                ? "Template"
                : rubric.owner_id === profile.id
                ? "Your rubric"
                : "Teacher rubric"}
            </span>
        </div>

        {rubric.description && (
          <p>{rubric.description}</p>
        )}

        <p className="muted">
          {rubric.categories.length} categories ·{" "}
          {formatPoints(total)} total points
        </p>

        <ul className="rubric-card__categories">
          {rubric.categories.map((category) => (
            <li key={category.id}>
              <span>{category.name}</span>
              <strong>
                {formatPoints(category.max_points)} points
              </strong>
            </li>
          ))}
        </ul>

        <details className="rubric-expectations">
          <summary>View scoring criteria</summary>

          {rubric.categories.map((category) => (
            <div key={category.id}>
              <h4>{category.name}</h4>
              <p>{category.description}</p>
            </div>
          ))}
        </details>

        <div className="card-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={() => openEditor("copy", rubric)}
            disabled={saving || editor !== null}
          >
            <Copy size={16} aria-hidden="true" />
            {rubric.is_template
              ? "Customize template"
              : "Create a copy"}
          </button>

          {!rubric.is_template && rubric.owner_id === profile.id && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => openEditor("edit", rubric)}
              disabled={saving || editor !== null}
            >
              <Pencil size={16} aria-hidden="true" />
              Edit
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="page rubrics-page">
      <div className="page-heading">
        <div>
          <h1>Rubrics</h1>

          <p className="muted">
            Define what strong writing looks like before grading.
          </p>
        </div>

        <div className="page-actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={refreshRubrics}
            disabled={rubricsLoading || saving}
          >
            <RefreshCw
              size={18}
              className={rubricsLoading ? "spin" : undefined}
              aria-hidden="true"
            />
            Refresh
          </button>

          <button
            type="button"
            className="button button--primary"
            onClick={() => openEditor("create")}
            disabled={saving || editor !== null}
          >
            <Plus size={18} aria-hidden="true" />
            New rubric
          </button>
        </div>
      </div>

      {success && (
        <StatusMessage
          type="success"
          title="Rubric saved"
          message={success}
        />
      )}

      {rubricsError && (
        <StatusMessage
          type="error"
          title="Could not refresh the rubric list"
          message={rubricsError}
          onRetry={refreshRubrics}
          retrying={rubricsLoading}
        />
      )}

      {editor && (
        <section className="panel">
          <h2>
            {editor.mode === "edit"
              ? "Edit custom rubric"
              : editor.mode === "copy"
                ? "Customize a copy"
                : "Create a rubric"}
          </h2>

          <p className="muted">
            {editor.mode === "edit"
              ? "Changes apply when this rubric is selected for new essays."
              : "Save your categories and scoring criteria as a new rubric."}
          </p>

          <RubricEditor
            key={editor.key}
            initialRubric={editor.rubric}
            onSave={handleSave}
            onCancel={() => setEditor(null)}
            submitLabel={
              editor.mode === "edit"
                ? "Save changes"
                : "Create rubric"
            }
          />
        </section>
      )}

      {rubricsLoading && rubrics.length === 0 && (
        <StatusMessage
          type="loading"
          title="Loading rubrics"
          message="Getting templates and custom scoring criteria."
        />
      )}

      {templates.length > 0 && (
        <section className="rubric-section">
          <h2>Templates</h2>

          <p className="muted">
            Select these when creating an essay, or customize a copy.
          </p>

          <div className="rubric-grid">
            {templates.map(renderRubric)}
          </div>
        </section>
      )}

      <section className="rubric-section">
        <h2>Custom rubrics</h2>

        {customRubrics.length > 0 ? (
          <div className="rubric-grid">
            {customRubrics.map(renderRubric)}
          </div>
        ) : (
          !rubricsLoading &&
          !rubricsError && (
            <StatusMessage
              type="empty"
              title="No custom rubrics yet"
              message="Create a rubric or customize one of the templates."
            />
          )
        )}
      </section>
    </div>
  );
}