import { supabase } from "./supabase";

const BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || ""
)
  .trim()
  .replace(/\/+$/, "");

function positiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

const DEFAULT_TIMEOUT = positiveNumber(
  import.meta.env.VITE_API_TIMEOUT_MS,
  15000,
);

const GRADING_TIMEOUT = positiveNumber(
  import.meta.env.VITE_GRADING_TIMEOUT_MS,
  120000,
);

export class ApiError extends Error {
  constructor(
    message,
    {
      status = 0,
      code = "request_failed",
      retryable = false,
      details = null,
    } = {},
  ) {
    super(message);

    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

function extractError(payload, status) {
  const detail = payload?.detail;

  if (Array.isArray(detail)) {
    const message = detail
      .map((item) => {
        const field = Array.isArray(item.loc)
          ? item.loc
              .filter((part) => part !== "body")
              .join(".")
          : "";

        return field
          ? `${field}: ${item.msg || "Invalid value"}`
          : item.msg || "Invalid value";
      })
      .join("; ");

    return new ApiError(message || "Invalid request.", {
      status,
      code: "validation_error",
      details: detail,
    });
  }

  if (detail && typeof detail === "object") {
    return new ApiError(
      detail.message || "The request failed.",
      {
        status,
        code: detail.code || "request_failed",
        retryable:
          typeof detail.retryable === "boolean"
            ? detail.retryable
            : status === 429 || status >= 500,
        details: detail,
      },
    );
  }

  return new ApiError(
    typeof detail === "string"
      ? detail
      : `The request failed (${status}).`,
    {
      status,
      code:
        status === 401
          ? "unauthorized"
          : status === 403
            ? "forbidden"
            : "request_failed",
      retryable: status === 429 || status >= 500,
      details: payload,
    },
  );
}

/**
 * Let cancellation stop waiting for session retrieval as well as fetch.
 * This does not cancel Supabase's own shared session operation.
 */
function waitWithSignal(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      reject(new DOMException("Request cancelled", "AbortError"));
    };

    if (signal.aborted) {
      abort();
      return;
    }

    signal.addEventListener("abort", abort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

async function request(
  path,
  {
    method = "GET",
    body,
    signal,
    timeoutMs = DEFAULT_TIMEOUT,
    authenticated = true,
  } = {},
) {
  const controller = new AbortController();
  let timedOut = false;

  const cancelRequest = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", cancelRequest, {
      once: true,
    });
  }

  const timeoutId = window.setTimeout(() => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort();
    }
  }, timeoutMs);

  try {
    const headers = {
      Accept: "application/json",
    };

    if (authenticated) {
      const { data, error } = await waitWithSignal(
        supabase.auth.getSession(),
        controller.signal,
      );

      if (error) {
        throw new ApiError(
          "Could not load your session. Please sign in again.",
          {
            status: 401,
            code: "session_error",
          },
        );
      }

      const token = data.session?.access_token;

      if (!token) {
        throw new ApiError("Sign in to continue.", {
          status: 401,
          code: "unauthorized",
        });
      }

      // Session retrieval supplies the token; the backend verifies it.
      headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body:
        body !== undefined
          ? JSON.stringify(body)
          : undefined,
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
    });

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError(
          response.ok
            ? "The server returned an unexpected response."
            : `The server could not complete the request (${response.status}).`,
          {
            status: response.status,
            code: "invalid_response",
            retryable: response.status >= 500,
          },
        );
      }
    }

    if (!response.ok) {
      throw extractError(payload, response.status);
    }

    return payload;
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) {
        throw new ApiError(
          method === "GET"
            ? "The request timed out. Please try again."
            : "The request timed out. Refresh to check whether it completed before submitting again.",
          {
            code: "timeout",
            retryable: method === "GET",
          },
        );
      }

      throw new ApiError("The request was cancelled.", {
        code: "cancelled",
      });
    }

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError) {
      throw new ApiError(
        method === "GET"
          ? "Cannot reach the backend. Check that it is running."
          : "The connection failed. Check the saved state before submitting again.",
        {
          code: "network_error",
          retryable: method === "GET",
        },
      );
    }

    throw new ApiError(
      "An unexpected request error occurred.",
      { code: "unexpected_error" },
    );
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", cancelRequest);
  }
}

function idPath(value) {
  return encodeURIComponent(value);
}

export function isCancelled(error) {
  return (
    error instanceof ApiError &&
    error.code === "cancelled"
  );
}

export const api = {
  health({ signal } = {}) {
    return request("/api/health", {
      signal,
      authenticated: false,
    });
  },

  getProfile({ signal } = {}) {
    return request("/api/me", { signal });
  },

  listTeachers({ signal } = {}) {
    return request("/api/teachers", { signal });
  },

  listRubrics({ signal } = {}) {
    return request("/api/rubrics", { signal });
  },

  createRubric(payload, { signal } = {}) {
    return request("/api/rubrics", {
      method: "POST",
      body: payload,
      signal,
    });
  },

  updateRubric(rubricId, payload, { signal } = {}) {
    return request(`/api/rubrics/${idPath(rubricId)}`, {
      method: "PUT",
      body: payload,
      signal,
    });
  },

  listEssays({ signal } = {}) {
    return request("/api/essays", { signal });
  },

  createEssay(payload, { signal } = {}) {
    return request("/api/essays", {
      method: "POST",
      body: payload,
      signal,
    });
  },

  getEssay(essayId, { signal } = {}) {
    return request(`/api/essays/${idPath(essayId)}`, {
      signal,
    });
  },

  createDraft(essayId, payload, { signal } = {}) {
    return request(`/api/essays/${idPath(essayId)}/drafts`, {
      method: "POST",
      body: payload,
      signal,
    });
  },

  getDraft(draftId, { signal } = {}) {
    return request(`/api/drafts/${idPath(draftId)}`, {
      signal,
    });
  },

  gradeDraft(draftId, { signal } = {}) {
    return request(`/api/drafts/${idPath(draftId)}/grade`, {
      method: "POST",
      signal,
      timeoutMs: GRADING_TIMEOUT,
    });
  },

  compareDrafts(
    essayId,
    olderId,
    newerId,
    { signal } = {},
  ) {
    const query = new URLSearchParams({
      older_id: olderId,
      newer_id: newerId,
    });

    return request(
      `/api/essays/${idPath(essayId)}/compare?${query}`,
      { signal },
    );
  },

  getProgress(essayId, { signal } = {}) {
    return request(`/api/essays/${idPath(essayId)}/progress`, {
      signal,
    });
  },

  listTeacherSubmissions({ signal } = {}) {
    return request("/api/teacher/submissions", { signal });
  },

  createTeacherReview(
    assessmentId,
    payload,
    { signal } = {},
  ) {
    return request(
      `/api/assessments/${idPath(assessmentId)}/reviews`,
      {
        method: "POST",
        body: payload,
        signal,
      },
    );
  },
};