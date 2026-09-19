import { useRef, useState } from "react";
import { api } from "../services/api";

const ACCEPTED_TYPES = ".txt,.md,.pdf,.docx";

export default function DocumentUpload({
  onTextExtracted,
  disabled = false,
}) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setLoading(true);

    try {
      const result = await api.extractDocument(file);

      if (!result?.content?.trim()) {
        throw new Error("No readable essay text was found.");
      }

      onTextExtracted(result.content, result.filename);
    } catch (uploadError) {
      setError(
        uploadError?.message ||
          "The document could not be uploaded.",
      );
    } finally {
      setLoading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <div className="document-upload">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileChange}
        disabled={disabled || loading}
        aria-label="Upload essay document"
      />

      {loading && (
        <p role="status">
          Extracting essay text…
        </p>
      )}

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      <small>
        Supported files: TXT, Markdown, PDF, and DOCX. Maximum size: 10 MB.
      </small>
    </div>
  );
}