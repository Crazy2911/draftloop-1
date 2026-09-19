import pytest

from app.document_parser import (
    DocumentExtractionError,
    extract_document_text,
)


def test_plain_text_file_is_extracted():
    result = extract_document_text(
        filename="essay.txt",
        content_type="text/plain",
        data=b"First paragraph.\n\nSecond paragraph.",
    )

    assert result == "First paragraph.\n\nSecond paragraph."


def test_markdown_file_is_extracted():
    result = extract_document_text(
        filename="essay.md",
        content_type="text/markdown",
        data=b"# Essay title\n\nEssay content.",
    )

    assert result == "# Essay title\n\nEssay content."


def test_empty_file_is_rejected():
    with pytest.raises(DocumentExtractionError, match="empty"):
        extract_document_text(
            filename="empty.txt",
            content_type="text/plain",
            data=b"",
        )


def test_unsupported_file_type_is_rejected():
    with pytest.raises(
        DocumentExtractionError,
        match="Supported file types",
    ):
        extract_document_text(
            filename="essay.exe",
            content_type="application/octet-stream",
            data=b"not an essay",
        )


def test_invalid_utf8_text_file_is_rejected():
    with pytest.raises(
        DocumentExtractionError,
        match="UTF-8",
    ):
        extract_document_text(
            filename="essay.txt",
            content_type="text/plain",
            data=b"\xff\xfe\xfa",
        )