import { useId, useRef, useState } from "react";
import { Save, Upload } from "lucide-react";

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
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");

  const submitting = useRef(false);
  const uploading = useRef(false);
  const countId = useId();

  // Python counts Unicode code points, so match that on the frontend.
  const characterCount = Array.from(content).length;

  const wordCount = content.trim()
    ? content.trim().split(/\s+/u).length
    : 0;

  const overLimit = characterCount > maxCharacters;
  const busy = saving || readingFile;

  async function handleUpload(event) {
    const file = event.target.files?.[0];

    // Allow selecting the same file again after an error.
    event.target.value = "";

    if (!file || uploading.current || submitting.current) {
      return;
    }

    setError(null);
    setNotice("");

    if (!file.name.toLowerCase().endsWith(".txt")) {
      setError("Choose a plain-text file ending in .txt.");
      return;
    }

    // A UTF-8 character takes at most four bytes, plus a possible BOM.
    if (file.size > maxCharacters * 4 + 3) {
      setError(
        `This file is too large. Essays can contain up to ` +
        `${maxCharacters.toLocaleString()} characters.`,
      );
      return;
    }

    uploading.current = true;
    setReadingFile(true);

    try {
      const buffer = await file.arrayBuffer();
      let uploadedText;

      try {
        uploadedText = new TextDecoder("utf-8", {
          fatal: true,
        }).decode(buffer);
      } catch {
        throw new Error(
          "This file is not valid UTF-8 text. " +
          "Save it with UTF-8 encoding or paste the essay instead.",
        );
      }

      if (!uploadedText.trim()) {
        throw new Error("The selected file contains no essay text.");
      }

      if (uploadedText.includes("\0")) {
        throw new Error(
          "The file contains unsupported characters. " +
          "Choose a plain UTF-8 text file.",
        );
      }

      if (Array.from(uploadedText).length > maxCharacters) {
        throw new Error(
          `The essay exceeds the ` +
          `${maxCharacters.toLocaleString()}-character limit.`,
        );
      }

      if (
        content.length > 0 &&
        !window.confirm(
          "Replace the text currently in this editor with the uploaded file?",
        )
      ) {
        return;
      }

      setContent(uploadedText);
      setNotice(
        `Loaded "${file.name}". Save the draft to store it.`,
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The file could not be read.",
      );
    } finally {
      uploading.current = false;
      setReadingFile(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submitting.current || uploading.current) {
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

        <label className="form-field">
          <span className="upload-label">
            <Upload size={18} aria-hidden="true" />
            Upload essay text — optional
          </span>

          <input
            type="file"
            accept=".txt,text/plain"
            onChange={handleUpload}
          />

          <small className="muted">
            Choose a UTF-8 .txt file, or paste your essay below.
          </small>
        </label>

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
          {saving
            ? "Saving…"
            : readingFile
              ? "Reading file…"
              : submitLabel}
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