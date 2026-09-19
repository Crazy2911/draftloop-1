from __future__ import annotations

from io import BytesIO
from pathlib import Path

from docx import Document
from pypdf import PdfReader

from app.config import settings


MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class DocumentExtractionError(ValueError):
    """Raised when an uploaded document cannot be safely read."""


def _validate_size(data: bytes) -> None:
    if not data:
        raise DocumentExtractionError(
            "The uploaded document is empty."
        )

    if len(data) > MAX_UPLOAD_BYTES:
        raise DocumentExtractionError(
            "The uploaded document must be smaller than 10 MB."
        )


def _extract_pdf(data: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(data))
    except Exception as error:
        raise DocumentExtractionError(
            "The PDF could not be opened."
        ) from error

    if reader.is_encrypted:
        raise DocumentExtractionError(
            "Password-protected PDFs are not supported."
        )

    paragraphs: list[str] = []

    for page in reader.pages:
        try:
            page_text = page.extract_text() or ""
        except Exception as error:
            raise DocumentExtractionError(
                "Text could not be extracted from the PDF."
            ) from error

        page_text = page_text.strip()

        if page_text:
            paragraphs.append(page_text)

    return "\n\n".join(paragraphs)


def _extract_docx(data: bytes) -> str:
    try:
        document = Document(BytesIO(data))
    except Exception as error:
        raise DocumentExtractionError(
            "The DOCX document could not be opened."
        ) from error

    paragraphs = [
        paragraph.text.strip()
        for paragraph in document.paragraphs
        if paragraph.text.strip()
    ]

    return "\n\n".join(paragraphs)


def _extract_text(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise DocumentExtractionError(
            "The text file must use UTF-8 encoding."
        ) from error


def extract_document_text(
    filename: str | None,
    content_type: str | None,
    data: bytes,
) -> str:
    _validate_size(data)

    safe_filename = Path(filename or "").name
    extension = Path(safe_filename).suffix.lower()
    normalized_content_type = (content_type or "").lower()

    if extension in {".txt", ".md"} or normalized_content_type in {
        "text/plain",
        "text/markdown",
    }:
        extracted_text = _extract_text(data)

    elif extension == ".pdf" or normalized_content_type == "application/pdf":
        extracted_text = _extract_pdf(data)

    elif extension == ".docx" or normalized_content_type in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }:
        extracted_text = _extract_docx(data)

    else:
        raise DocumentExtractionError(
            "Supported file types are TXT, Markdown, PDF, and DOCX."
        )

    extracted_text = extracted_text.strip()

    if not extracted_text:
        raise DocumentExtractionError(
            "No readable text was found in the uploaded document."
        )

    if len(extracted_text) > settings.max_essay_characters:
        raise DocumentExtractionError(
            "The extracted essay exceeds the configured character limit."
        )

    return extracted_text