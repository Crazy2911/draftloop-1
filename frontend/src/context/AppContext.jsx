import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api, isCancelled } from "../services/api";
import { useAuth } from "./AuthContext";

const AppContext = createContext(null);

function useResource(loader, initialValue, enabled = true) {
  const initialValueRef = useRef(initialValue);
  const controllerRef = useRef(null);

  const [data, setData] = useState(initialValue);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    controllerRef.current = null;

    if (!enabled) {
      setData(initialValueRef.current);
      setLoading(false);
      setError(null);
      return null;
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const result = await loader({
        signal: controller.signal,
      });

      if (
        controller.signal.aborted ||
        controllerRef.current !== controller
      ) {
        return null;
      }

      setData(result);
      return result;
    } catch (requestError) {
      if (
        !controller.signal.aborted &&
        controllerRef.current === controller &&
        !isCancelled(requestError)
      ) {
        setError(requestError);
      }

      return null;
    } finally {
      if (
        !controller.signal.aborted &&
        controllerRef.current === controller
      ) {
        setLoading(false);
      }
    }
  }, [loader, enabled]);

  useEffect(() => {
    void refresh();

    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [refresh]);

  return {
    data,
    loading,
    error,
    refresh,
  };
}

export function AppProvider({ children }) {
  const { profile, authenticated } = useAuth();

  const isStudent = profile?.role === "student";
  const isTeacher = profile?.role === "teacher";

  const {
    data: health,
    loading: healthLoading,
    error: healthError,
    refresh: refreshHealth,
  } = useResource(api.health, null, authenticated);

  const {
    data: rubrics,
    loading: rubricsLoading,
    error: rubricsError,
    refresh: refreshRubrics,
  } = useResource(api.listRubrics, [], authenticated);

  const essayLoader = isTeacher
    ? api.listTeacherSubmissions
    : api.listEssays;

  const {
    data: essays,
    loading: essaysLoading,
    error: essaysError,
    refresh: refreshEssays,
  } = useResource(essayLoader, [], authenticated);

  const {
    data: teachers,
    loading: teachersLoading,
    error: teachersError,
    refresh: refreshTeachers,
  } = useResource(
    api.listTeachers,
    [],
    authenticated && isStudent,
  );

  const refreshAll = useCallback(async () => {
    const [
      nextHealth,
      nextRubrics,
      nextEssays,
      nextTeachers,
    ] = await Promise.all([
      refreshHealth(),
      refreshRubrics(),
      refreshEssays(),
      refreshTeachers(),
    ]);

    return {
      health: nextHealth,
      rubrics: nextRubrics,
      essays: nextEssays,
      teachers: nextTeachers,
    };
  }, [
    refreshHealth,
    refreshRubrics,
    refreshEssays,
    refreshTeachers,
  ]);

  const value = useMemo(
    () => ({
      profile,
      isStudent,
      isTeacher,

      health,
      healthLoading,
      healthError,
      refreshHealth,

      rubrics,
      rubricsLoading,
      rubricsError,
      refreshRubrics,

      essays,
      essaysLoading,
      essaysError,
      refreshEssays,

      teachers,
      teachersLoading,
      teachersError,
      refreshTeachers,

      refreshAll,
    }),
    [
      profile,
      isStudent,
      isTeacher,
      health,
      healthLoading,
      healthError,
      refreshHealth,
      rubrics,
      rubricsLoading,
      rubricsError,
      refreshRubrics,
      essays,
      essaysLoading,
      essaysError,
      refreshEssays,
      teachers,
      teachersLoading,
      teachersError,
      refreshTeachers,
      refreshAll,
    ],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);

  if (context === null) {
    throw new Error(
      "useApp must be used inside an AppProvider.",
    );
  }

  return context;
}