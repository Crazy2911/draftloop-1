import { useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  TrendingUp,
} from "lucide-react";

import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import StatusMessage from "./StatusMessage";

export default function Layout() {
  const {
    health,
    healthLoading,
    healthError,
    refreshHealth,
  } = useApp();

  const { profile, signOut } = useAuth();

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const signingOutRef = useRef(false);

  const isTeacher = profile.role === "teacher";
  const homePath = isTeacher ? "/teacher" : "/";

  const navItems = [
    isTeacher
      ? {
          to: "/teacher",
          label: "Teacher review",
          icon: GraduationCap,
          end: true,
        }
      : {
          to: "/",
          label: "My essays",
          icon: LayoutDashboard,
          end: true,
        },
    {
      to: "/rubrics",
      label: "Rubrics",
      icon: ClipboardList,
    },
    {
      to: "/progress",
      label: "Progress",
      icon: TrendingUp,
    },
  ];

  const connectionLabel = healthLoading
    ? "Checking connection…"
    : healthError
      ? "Backend unavailable"
      : health?.ai_configured
        ? "Backend connected"
        : "AI grading unavailable";

  async function handleSignOut() {
    if (signingOutRef.current) return;

    signingOutRef.current = true;
    setSigningOut(true);
    setSignOutError(null);

    try {
      await signOut();

      // ProtectedRoute redirects when the session is cleared.
    } catch (error) {
      setSignOutError(error);
    } finally {
      signingOutRef.current = false;
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <aside className="app-sidebar">
        <NavLink
          to={homePath}
          className="brand"
          aria-label="DraftLoop dashboard"
        >
          <span className="brand__icon">
            <BookOpen size={25} aria-hidden="true" />
          </span>

          <span>DraftLoop</span>
        </NavLink>

        <nav
          className="app-nav"
          aria-label="Main navigation"
        >
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `app-nav__link${
                  isActive ? " app-nav__link--active" : ""
                }`
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="sidebar-note__title">
            {isTeacher ? "Teacher workspace" : "Student workspace"}
          </p>

          <p>
            {isTeacher
              ? "Review essays assigned to you and record your feedback."
              : "Save your drafts, review feedback, and track revisions."}
          </p>
        </div>
      </aside>

      <div className="app-body">
        <header className="app-header">
          <div>
            <p className="app-header__label">
              {profile.display_name} ·{" "}
              {isTeacher ? "Teacher" : "Student"}
            </p>

            <span
              className={
                healthError
                  ? "connection-status connection-status--error"
                  : "connection-status"
              }
              role="status"
            >
              {connectionLabel}
            </span>
          </div>

          <button
            type="button"
            className="button button--secondary"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut size={18} aria-hidden="true" />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </header>

        <main
          id="main-content"
          className="app-main"
          tabIndex={-1}
        >
          {signOutError && (
            <StatusMessage
              type="error"
              title="Could not sign out"
              message={signOutError}
            />
          )}

          {healthError && (
            <StatusMessage
              type="error"
              title="Cannot connect to the backend"
              message={healthError}
              onRetry={refreshHealth}
              retrying={healthLoading}
            />
          )}

          {!healthLoading &&
            !healthError &&
            health &&
            !health.ai_configured && (
              <StatusMessage
                type="info"
                title="AI grading is currently unavailable"
                message={
                  "You can still save drafts and read existing feedback. " +
                  "The administrator needs to configure the grading service."
                }
                onRetry={refreshHealth}
                retryLabel="Check again"
              />
            )}

          <Outlet />
        </main>

        <footer className="app-footer">
          AI feedback supports revision. Teachers decide final grades.
        </footer>
      </div>
    </div>
  );
}