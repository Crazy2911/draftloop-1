import { useRef, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";

import StatusMessage from "./StatusMessage";

function createCategory() {
  return {
    id: `category_${crypto.randomUUID()}`,
    name: "",
    description: "",
    max_points: "25",
  };
}

function initialForm(rubric) {
  if (rubric) {
    return {
      name: rubric.name,
      description: rubric.description || "",
      categories: rubric.categories.map((category) => ({
        ...category,
        max_points: String(category.max_points),
      })),
    };
  }

  return {
    name: "",
    description: "",
    categories: [createCategory()],
  };
}

export default function RubricEditor({
  initialRubric = null,
  onSave,
  onCancel,
  submitLabel = "Save rubric",
}) {
  const [form, setForm] = useState(() =>
    initialForm(initialRubric),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const submitting = useRef(false);

  const totalPoints = form.categories.reduce(
    (total, category) => {
      const points = Number(category.max_points);

      return total + (
        Number.isFinite(points) && points > 0
          ? points
          : 0
      );
    },
    0,
  );

  function updateCategory(index, field, value) {
    setForm((current) => ({
      ...current,
      categories: current.categories.map((category, position) =>
        position === index
          ? { ...category, [field]: value }
          : category,
      ),
    }));
  }

  function addCategory() {
    setForm((current) => {
      if (current.categories.length >= 12) {
        return current;
      }

      return {
        ...current,
        categories: [
          ...current.categories,
          createCategory(),
        ],
      };
    });
  }

  function removeCategory(index) {
    setForm((current) => {
      if (current.categories.length <= 1) {
        return current;
      }

      return {
        ...current,
        categories: current.categories.filter(
          (_, position) => position !== index,
        ),
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting.current) return;

    setError(null);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      categories: form.categories.map((category) => ({
        id: category.id,
        name: category.name.trim(),
        description: category.description.trim(),
        max_points: Number(category.max_points),
      })),
    };

    if (!payload.name) {
      setError("Enter a rubric name.");
      return;
    }

    const invalidCategory = payload.categories.some(
      (category) =>
        !category.name ||
        !category.description ||
        !Number.isFinite(category.max_points) ||
        category.max_points <= 0 ||
        category.max_points > 1000,
    );

    if (invalidCategory) {
      setError(
        "Every category needs a name, scoring description, " +
        "and point value greater than 0 and no more than 1,000.",
      );
      return;
    }

    const names = payload.categories.map((category) =>
      category.name.toLowerCase(),
    );

    if (new Set(names).size !== names.length) {
      setError("Give each category a different name.");
      return;
    }

    if (typeof onSave !== "function") {
      setError("The save action is not connected.");
      return;
    }

    submitting.current = true;
    setSaving(true);

    try {
      await onSave(payload);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The rubric could not be saved.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      className="rubric-editor"
      onSubmit={handleSubmit}
      aria-busy={saving}
    >
      {error && (
        <StatusMessage
          type="error"
          title="Rubric not saved"
          message={error}
        />
      )}

      <fieldset
        className="form-fieldset"
        disabled={saving}
      >
        <legend className="sr-only">Rubric details</legend>

        <label className="form-field">
          <span>Rubric name</span>

          <input
            type="text"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
            maxLength={200}
            placeholder="For example, Argumentative Essay"
            required
          />
        </label>

        <label className="form-field">
          <span>Description — optional</span>

          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            maxLength={3000}
            rows={3}
            placeholder="What should this rubric assess?"
          />
        </label>

        <div className="section-heading">
          <div>
            <h3>Scoring categories</h3>
            <p className="muted">
              Point values determine each category’s weight.
              The total does not have to equal 100.
            </p>
          </div>

          <span className="badge">
            {totalPoints.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}{" "}
            total points
          </span>
        </div>

        <div className="rubric-categories">
          {form.categories.map((category, index) => {
            const points = Number(category.max_points);

            const weight =
              totalPoints > 0 &&
              Number.isFinite(points) &&
              points > 0
                ? (points / totalPoints) * 100
                : 0;

            return (
              <fieldset
                key={category.id}
                className="rubric-category"
              >
                <legend>Category {index + 1}</legend>

                <div className="form-grid">
                  <label className="form-field">
                    <span>Category name</span>

                    <input
                      type="text"
                      value={category.name}
                      onChange={(event) =>
                        updateCategory(
                          index,
                          "name",
                          event.target.value,
                        )
                      }
                      maxLength={200}
                      placeholder="For example, Argument Strength"
                      required
                    />
                  </label>

                  <label className="form-field">
                    <span>Maximum points</span>

                    <input
                      type="number"
                      value={category.max_points}
                      onChange={(event) =>
                        updateCategory(
                          index,
                          "max_points",
                          event.target.value,
                        )
                      }
                      min="0.01"
                      max="1000"
                      step="any"
                      required
                    />

                    <small className="muted">
                      {weight.toFixed(1)}% of the total
                    </small>
                  </label>
                </div>

                <label className="form-field">
                  <span>Scoring description</span>

                  <textarea
                    value={category.description}
                    onChange={(event) =>
                      updateCategory(
                        index,
                        "description",
                        event.target.value,
                      )
                    }
                    maxLength={3000}
                    rows={4}
                    placeholder={
                      "Describe excellent, adequate, and weak " +
                      "performance for this category."
                    }
                    required
                  />
                </label>

                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => removeCategory(index)}
                  disabled={form.categories.length === 1}
                  aria-label={`Remove category ${index + 1}`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Remove category
                </button>
              </fieldset>
            );
          })}
        </div>

        <button
          type="button"
          className="button button--secondary"
          onClick={addCategory}
          disabled={form.categories.length >= 12}
        >
          <Plus size={18} aria-hidden="true" />
          Add category
        </button>

        <p className="muted">
          {form.categories.length} of 12 categories
        </p>
      </fieldset>

      <div className="form-actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={saving}
        >
          <Save size={18} aria-hidden="true" />
          {saving ? "Saving…" : submitLabel}
        </button>

        {onCancel && (
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}