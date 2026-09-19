import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import StatusMessage from "../components/StatusMessage";

export default function ResetPasswordPage() {
  const {
    session,
    initializing,
    sessionError,
    updatePassword,
    signOut,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [updated, setUpdated] = useState(false);

  const submittingRef = useRef(false);

  async function finishSignOut() {
    await signOut();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (submittingRef.current) return;

    setError(null);

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    if (!session) {
      setError(
        "Your recovery session is unavailable. Request a new reset email.",
      );
      return;
    }

    submittingRef.current = true;
    setBusy(true);

    try {
      await updatePassword(password);

      // Keep this success state even if signing out subsequently fails.
      setUpdated(true);
      setPassword("");
      setConfirmation("");

      try {
        await finishSignOut();
      } catch {
        setError(
          "Your password was updated, but signing out failed. " +
          "Use the sign-out button below before signing in again.",
        );
      }
    } catch (updateError) {
      setError(updateError);
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
      await finishSignOut();
    } catch (signOutError) {
      setError(signOutError);
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

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
        <h1>Set a new password</h1>

        {initializing ? (
          <StatusMessage
            type="loading"
            title="Checking your recovery session"
          />
        ) : updated ? (
          <>
            <StatusMessage
              type="success"
              title="Password updated"
              message={
                "Your new password has been saved. " +
                "Sign in again using it."
              }
            />

            {error && (
              <StatusMessage
                type="error"
                title="Sign-out needs attention"
                message={error}
              />
            )}

            {session ? (
              <button
                type="button"
                className="button button--primary"
                onClick={handleSignOut}
                disabled={busy}
              >
                {busy ? "Signing out…" : "Sign out"}
              </button>
            ) : (
              <Link
                to="/login"
                className="button button--primary"
              >
                Back to sign in
              </Link>
            )}
          </>
        ) : !session ? (
          <>
            <StatusMessage
              type="error"
              title="Recovery session unavailable"
              message={
                sessionError ||
                "This link may have expired or already been used. " +
                  "Request a new reset email and open it in the same " +
                  "browser where you requested it."
              }
            />

            <Link
              to="/login"
              className="button button--primary"
            >
              Go to sign in
            </Link>

            <p className="muted" style={{ marginTop: "1rem" }}>
              Select “Forgot password?” to request another email.
            </p>
          </>
        ) : (
          <>
            <p className="muted">
              Choose a password with at least 8 characters.
            </p>

            {error && (
              <StatusMessage
                type="error"
                title="Password could not be updated"
                message={error}
              />
            )}

            <form
              onSubmit={handleSubmit}
              aria-busy={busy}
            >
              <fieldset
                className="form-fieldset"
                disabled={busy}
              >
                <legend className="sr-only">
                  New password
                </legend>

                <label className="form-field">
                  <span>New password</span>

                  <input
                    type="password"
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Confirm new password</span>

                  <input
                    type="password"
                    value={confirmation}
                    onChange={(event) =>
                      setConfirmation(event.target.value)
                    }
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              </fieldset>

              <div className="form-actions">
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={busy}
                >
                  {busy ? "Updating…" : "Update password"}
                </button>

                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleSignOut}
                  disabled={busy}
                >
                  Cancel and sign out
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  );
}