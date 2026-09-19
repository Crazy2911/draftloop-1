import { useId, useRef, useState } from "react";
import { Save, Upload } from "lucide-react";
import DocumentUpload from "./DocumentUpload";
import StatusMessage from "./StatusMessage";

export default function EssayEditor({
  initialContent = "",
  initialReflection = "",
  maxCharacters = 30000,
  onSave,
  onCancel,
  submitLabel = "Save draft",
}) {
  const [content, setContent] = useState(initialContent);
  const [reflection, setReflection] = useState(
    initialReflection,
  );
  const [saving, setSaving] = useState(false);
  
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");

  const submitting = useRef(false);
  
  const countId = useId();

  // Python counts Unicode code points, so match that on the frontend.
  const characterCount = Array.from(content).length;

  const wordCount = content.trim()
    ? content.trim().split(/\s+/u).length
    : 0;

  const overLimit = characterCount > maxCharacters;
  const busy = saving ;
    function handleExtractedDocument(text, filename) {
    setError(null);

    if (
      content.trim() &&
      !window.confirm(
        "Replace the text currently in this editor with the uploaded document?",
      )
    ) {
      return;
    }

    setContent(text);
    setNotice(
      `Loaded "${filename}". Save the draft to store it.`,
    );
  }

  

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting.current ) {
      return;
    }

    setError(null);
    setNotice("");

    if (!content.trim()) {
      setError("Enter or upload your essay before saving.");
      return;
    }

    if (content.includes("\0")) {
      setError("Remove null characters from the essay text.");
      return;
    }

    if (overLimit) {
      setError(
        `Shorten the essay to ` +
        `${maxCharacters.toLocaleString()} characters or fewer.`,
      );
      return;
    }

    if (typeof onSave !== "function") {
      setError("The save action is not connected.");
      return;
    }

    submitting.current = true;
    setSaving(true);

    try {
      // Preserve essay whitespace for exact comparisons and comments.
      await onSave({
        content,
        reflection: reflection.trim(),
      });

      setNotice(
        "Draft saved. It is now available in your draft history.",
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The draft could not be saved.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      className="essay-editor"
      onSubmit={handleSubmit}
      aria-busy={busy}
    >
      {error && (
        <StatusMessage
          type="error"
          title="Please check your draft"
          message={error}
        />
      )}

      {notice && (
        <StatusMessage
          type="info"
          title="Draft update"
          message={notice}
        />
      )}

      <fieldset
        className="form-fieldset"
        disabled={busy}
      >
        <legend className="sr-only">Essay draft</legend>

                <div className="form-field">
          <span className="upload-label">
            <Upload size={18} aria-hidden="true" />
            Upload essay document — optional
          </span>

          <DocumentUpload
            disabled={busy}
            onTextExtracted={handleExtractedDocument}
          />
        </div>

        <label className="form-field">
          <span>Essay text</span>

          <textarea
            className="essay-editor__textarea"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setNotice("");
            }}
            rows={18}
            placeholder="Write or paste your essay here…"
            aria-describedby={countId}
            aria-invalid={overLimit}
            spellCheck
            required
          />
        </label>

        <p
          id={countId}
          className={
            overLimit
              ? "editor-count editor-count--error"
              : "editor-count muted"
          }
        >
          {wordCount.toLocaleString()} words ·{" "}
          {characterCount.toLocaleString()} /{" "}
          {maxCharacters.toLocaleString()} characters
        </p>

        <label className="form-field">
          <span>What did you change? — optional</span>

          <textarea
            value={reflection}
            onChange={(event) => {
              setReflection(event.target.value);
              setNotice("");
            }}
            rows={3}
            maxLength={3000}
            placeholder={
              "For a revision, explain which feedback you addressed " +
              "and what you changed."
            }
          />
        </label>

        <p className="muted">
          Saving creates a new draft. Earlier submissions remain unchanged.
        </p>
      </fieldset>

      <div className="form-actions">
        <button
          type="submit"
          className="button button--primary"
          disabled={busy || overLimit || !content.trim()}
        >
          <Save size={18} aria-hidden="true" />
          {saving ? "Saving…" : submitLabel}
        </button>

        {onCancel && (
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}