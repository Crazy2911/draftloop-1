import { useState } from "react";

import {
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";
import StatusMessage from "./StatusMessage";

export default function ProtectedRoute({
  allowedRoles,
  children,
}) {
  const location = useLocation();

  const {
    session,
    profile,
    initializing,
    profileLoading,
    sessionError,
    profileError,
    passwordRecovery,
    refreshProfile,
    signOut,
  } = useAuth();

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);

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

  // Recovery sessions should finish the password-reset flow first.
  if (session && passwordRecovery) {
    return <Navigate to="/reset-password" replace />;
  }

  if (!session) {
    if (sessionError) {
      return (
        <div className="page panel">
          <StatusMessage
            type="error"
            title="Could not restore your session"
            message={sessionError}
          />

          <Link
            to="/login"
            className="button button--primary"
          >
            Go to sign in
          </Link>
        </div>
      );
    }

    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
        }}
      />
    );
  }

  if (profileLoading) {
    return (
      <div className="page panel">
        <StatusMessage
          type="loading"
          title="Verifying account access"
          message="Loading your profile and permissions."
        />
      </div>
    );
  }

  if (profileError || !profile) {
    return (
      <div className="page panel">
        <StatusMessage
          type="error"
          title="Account verification could not be completed"
          message={
            profileError ||
            "Your account profile is unavailable."
          }
          onRetry={refreshProfile}
          retrying={signingOut}
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
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    );
  }

  if (
    allowedRoles?.length &&
    !allowedRoles.includes(profile.role)
  ) {
    const homePath =
      profile.role === "teacher" ? "/teacher" : "/";

    return (
      <div className="page panel">
        <StatusMessage
          type="info"
          title="This page is unavailable for your account"
          message="Your account does not have the required role."
        />

        <Link
          to={homePath}
          className="button button--primary"
        >
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return children ?? <Outlet />;
}