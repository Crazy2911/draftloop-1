import {
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";

import { useAuth } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";

import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

import LoginPage from "./pages/LoginPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

import StudentDashboard from "./pages/StudentDashboard";
import RubricsPage from "./pages/RubricsPage";
import EssayWorkspace from "./pages/EssayWorkspace";
import FeedbackPage from "./pages/FeedbackPage";
import RevisionPage from "./pages/RevisionPage";
import ProgressPage from "./pages/ProgressPage";
import TeacherDashboard from "./pages/TeacherDashboard";

function AuthenticatedWorkspace() {
  const { profile } = useAuth();

  return (
    <AppProvider key={`${profile.id}:${profile.role}`}>
      <Outlet />
    </AppProvider>
  );
}

function DashboardRoute() {
  const { profile } = useAuth();

  return profile.role === "teacher" ? (
    <Navigate to="/teacher" replace />
  ) : (
    <StudentDashboard />
  );
}

function NotFoundPage() {
  return (
    <div className="page">
      <div className="panel">
        <h1>Page not found</h1>

        <p>This address does not match a DraftLoop page.</p>

        <Link to="/" className="button button--primary">
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public authentication pages */}
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/auth/callback"
        element={<AuthCallbackPage />}
      />

      <Route
        path="/reset-password"
        element={<ResetPasswordPage />}
      />

      {/* All routes below require a verified backend profile. */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AuthenticatedWorkspace />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardRoute />} />

            <Route
              path="rubrics"
              element={<RubricsPage />}
            />

            <Route
              path="progress"
              element={<ProgressPage />}
            />

            {/* Only students can create essays or submit revisions. */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["student"]} />
              }
            >
              <Route
                path="essays/new"
                element={<EssayWorkspace />}
              />

              <Route
                path="essays/:essayId"
                element={<EssayWorkspace />}
              />
            </Route>

            {/* Backend permissions determine which drafts are visible. */}
            <Route
              path="essays/:essayId/drafts/:draftId"
              element={<FeedbackPage />}
            />

            <Route
              path="essays/:essayId/revisions"
              element={<RevisionPage />}
            />

            {/* Only teachers can open the review dashboard. */}
            <Route
              element={
                <ProtectedRoute allowedRoles={["teacher"]} />
              }
            >
              <Route
                path="teacher"
                element={<TeacherDashboard />}
              />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}