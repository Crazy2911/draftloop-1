import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import DocumentUpload from "../src/components/DocumentUpload";
import { api } from "../src/services/api";

vi.mock("../src/services/api", () => ({
  api: {
    extractDocument: vi.fn(),
  },
}));

describe("DocumentUpload", () => {
  it("uploads a document and returns extracted text", async () => {
    api.extractDocument.mockResolvedValue({
      filename: "essay.pdf",
      content: "Extracted essay content.",
      characters: 24,
    });

    const onTextExtracted = vi.fn();

    render(
      <DocumentUpload
        onTextExtracted={onTextExtracted}
      />,
    );

    const file = new File(
      ["essay content"],
      "essay.pdf",
      { type: "application/pdf" },
    );

    fireEvent.change(
      screen.getByLabelText("Upload essay document"),
      { target: { files: [file] } },
    );

    await waitFor(() => {
      expect(api.extractDocument).toHaveBeenCalledWith(file);
      expect(onTextExtracted).toHaveBeenCalledWith(
        "Extracted essay content.",
        "essay.pdf",
      );
    });
  });

  it("shows an error when extraction fails", async () => {
    api.extractDocument.mockRejectedValue(
      new Error("Unsupported document"),
    );

    render(
      <DocumentUpload
        onTextExtracted={vi.fn()}
      />,
    );

    const file = new File(
      ["bad file"],
      "essay.pdf",
      { type: "application/pdf" },
    );

    fireEvent.change(
      screen.getByLabelText("Upload essay document"),
      { target: { files: [file] } },
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Unsupported document");
  });
});