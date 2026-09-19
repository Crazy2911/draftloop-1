import { describe, expect, it, vi } from "vitest";

vi.mock("../src/services/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

import { ApiError } from "../src/services/api";

describe("ApiError", () => {
  it("preserves the request error message and status", () => {
    const error = new ApiError("AI grading failed", {
      status: 502,
      retryable: true,
      details: { code: "ai_provider_error" },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("AI grading failed");
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({
      code: "ai_provider_error",
    });
  });

  it("supports non-retryable errors", () => {
    const error = new ApiError("You are not authorized", {
      status: 403,
      retryable: false,
    });

    expect(error.status).toBe(403);
    expect(error.retryable).toBe(false);
  });
});