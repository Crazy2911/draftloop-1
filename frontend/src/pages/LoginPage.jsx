import { useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { BookOpen } from "lucide-react";

import { useAuth } from "../context/AuthContext";
import StatusMessage from "../components/StatusMessage";

function dashboardPath(profile, requestedPath) {
  const fallback = profile.role === "teacher" ? "/teacher" : "/";

  // Accept only internal application paths.
  if (
    typeof requestedPath !== "string" ||
    !requestedPath.startsWith("/") ||
    requestedPath.startsWith("//") ||
    requestedPath.includes("\\")
  ) {
    return fallback;
  }

  const pathname = requestedPath.split(/[?#]/)[0];

  if (
    ["/login", "/reset-password", "/auth/callback"].includes(pathname)
  ) {
    return fallback;
  }

  return requestedPath;
}

export default function LoginPage() {
  const location = useLocation();

  const {
    session,
    profile,
    authenticated,
    initializing,
    profileLoading,
    profileError,
    sessionError,
    passwordRecovery,
    refreshProfile,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");

  const submittingRef = useRef(false);

  function changeMode(nextMode) {
    if (submittingRef.current) return;

    setMode(nextMode);
    setError(null);
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setError(null);
    setNotice("");

    if (mode === "signup") {
      if (!displayName.trim()) {
        setError("Enter your display name.");
        return;
      }

      if (password.length < 8) {
        setError("Use a password with at least 8 characters.");
        return;
      }

      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }
    }

    submittingRef.current = true;
    setBusy(true);

    try {
      if (mode === "login") {
        await signIn({ email, password });
        setPassword("");
      } else if (mode === "signup") {
        const data = await signUp({
          displayName,
          email,
          password,
        });

        setPassword("");
        setConfirmPassword("");

        if (!data.session) {
          setNotice(
            "Check your email for a confirmation link. " +
            "If you already have an account, sign in or reset your password.",
          );
        }
      } else {
        await requestPasswordReset(email);

        setNotice(
          "If an account exists for this address, check its inbox " +
          "for password-reset instructions.",
        );
      }
    } catch (requestError) {
      setError(requestError);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setBusy(true);
    setError(null);

    try {
      await signOut();
    } catch (requestError) {
      setError(requestError);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  if (initializing) {
    return (
      <div className="page panel">
        <StatusMessage
          type="loading"
          title="Checking your session"
        />
      </div>
    );
  }

  if (session && passwordRecovery) {
    return <Navigate to="/reset-password" replace />;
  }

  if (authenticated) {
    return (
      <Navigate
        to={dashboardPath(profile, location.state?.from)}
        replace
      />
    );
  }

  if (session) {
    return (
      <div className="page panel">
        <h1>Verify account access</h1>

        {profileLoading ? (
          <StatusMessage
            type="loading"
            title="Loading your profile"
          />
        ) : (
          <StatusMessage
            type="error"
            title="Could not verify your profile"
            message={
              profileError ||
              "Your account profile is unavailable."
            }
            onRetry={refreshProfile}
            retrying={busy}
          />
        )}

        {error && (
          <StatusMessage
            type="error"
            title="Account action failed"
            message={error}
          />
        )}

        <button
          type="button"
          className="button button--secondary"
          onClick={handleSignOut}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  const title =
    mode === "signup"
      ? "Create your account"
      : mode === "reset"
        ? "Reset your password"
        : "Sign in to DraftLoop";

  return (
    <main
      className="page auth-page"
      style={{
        maxWidth: "34rem",
        margin: "0 auto",
        padding: "2rem 1rem",
      }}
    >
      <div className="panel">
        <p className="field-label">
          <BookOpen size={22} aria-hidden="true" /> DraftLoop
        </p>

        <h1>{title}</h1>

        {sessionError && (
          <StatusMessage
            type="info"
            title="Previous session could not be restored"
            message="Sign in again to continue."
          />
        )}

        {error && (
          <StatusMessage
            type="error"
            title="Please check your details"
            message={error}
          />
        )}

        {notice && (
          <StatusMessage
            type="info"
            title="Check your email"
            message={notice}
          />
        )}

        <form onSubmit={handleSubmit} aria-busy={busy}>
          <fieldset className="form-fieldset" disabled={busy}>
            <legend className="sr-only">{title}</legend>

            {mode === "signup" && (
              <label className="form-field">
                <span>Display name</span>
                <input
                  value={displayName}
                  onChange={(event) =>
                    setDisplayName(event.target.value)
                  }
                  autoComplete="name"
                  maxLength={200}
                  required
                />
              </label>
            )}

            <label className="form-field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>

            {mode !== "reset" && (
              <label className="form-field">
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete={
                    mode === "signup"
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={mode === "signup" ? 8 : undefined}
                  required
                />
              </label>
            )}

            {mode === "signup" && (
              <>
                <label className="form-field">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                      setConfirmPassword(event.target.value)
                    }
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>

                <p className="muted">
                  New accounts have student access.
                  Teacher access is granted by the administrator.
                </p>
              </>
            )}
          </fieldset>

          <button
            type="submit"
            className="button button--primary"
            disabled={busy}
          >
            {busy
              ? "Please wait…"
              : mode === "signup"
                ? "Create account"
                : mode === "reset"
                  ? "Send reset email"
                  : "Sign in"}
          </button>
        </form>

        <div className="form-actions">
          {mode !== "login" && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => changeMode("login")}
              disabled={busy}
            >
              Back to sign in
            </button>
          )}

          {mode === "login" && (
            <>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => changeMode("signup")}
                disabled={busy}
              >
                Create account
              </button>

              <button
                type="button"
                className="button button--secondary"
                onClick={() => changeMode("reset")}
                disabled={busy}
              >
                Forgot password?
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}