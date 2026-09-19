import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import StatusMessage from "../components/StatusMessage";

function hasCallbackError() {
  const query = new URLSearchParams(window.location.search);

  const hash = new URLSearchParams(
    window.location.hash.replace(/^#/, ""),
  );

  return (
    query.has("error") ||
    query.has("error_code") ||
    hash.has("error") ||
    hash.has("error_code")
  );
}

export default function AuthCallbackPage() {
  const {
    session,
    profile,
    authenticated,
    initializing,
    profileLoading,
    sessionError,
    profileError,
    passwordRecovery,
    refreshProfile,
    signOut,
  } = useAuth();

  const [callbackFailed] = useState(hasCallbackError);
  const [waitingExpired, setWaitingExpired] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setWaitingExpired(true);
    }, 20000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  async function handleSignOut() {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError(null);

    try {
      await signOut();
    } catch (error) {
      setSignOutError(error);
    } finally {
      setSigningOut(false);
    }
  }

  if (session && passwordRecovery) {
    return <Navigate to="/reset-password" replace />;
  }

  if (authenticated) {
    return (
      <Navigate
        to={profile.role === "teacher" ? "/teacher" : "/"}
        replace
      />
    );
  }

  const waiting =
    !callbackFailed &&
    !sessionError &&
    !profileError &&
    !waitingExpired &&
    (initializing || profileLoading || !session);

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
        <h1>Confirm your account</h1>

        {waiting ? (
          <StatusMessage
            type="loading"
            title="Completing sign-in"
            message="Checking your confirmation link and account profile."
          />
        ) : session ? (
          <>
            <StatusMessage
              type="error"
              title="Account verification needs attention"
              message={
                profileError ||
                "Your session is available, but your account profile " +
                  "could not be loaded. Try again."
              }
              onRetry={refreshProfile}
              retrying={profileLoading || signingOut}
            />

            {signOutError && (
              <StatusMessage
                type="error"
                title="Could not sign out"
                message={signOutError}
              />
            )}

            <button
              type="button"
              className="button button--secondary"
              onClick={handleSignOut}
              disabled={signingOut || profileLoading}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </>
        ) : (
          <>
            <StatusMessage
              type="info"
              title="Sign in to continue"
              message={
                callbackFailed
                  ? "This confirmation link could not be completed. " +
                    "It may have expired or already been used."
                  : "No active session was established. If your email " +
                    "is confirmed, sign in using your email and password."
              }
            />

            <p className="muted">
              Confirmation links work best in the same browser
              where you created your account.
            </p>

            <Link
              to="/login"
              className="button button--primary"
            >
              Go to sign in
            </Link>
          </>
        )}
      </div>
    </main>
  );
}