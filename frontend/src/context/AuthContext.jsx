import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { supabase } from "../services/supabase";
import { api, isCancelled } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionError, setSessionError] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  const [profileState, setProfileState] = useState({
    token: null,
    profile: null,
    error: null,
    loading: false,
  });

  const sessionRef = useRef(null);
  const profileControllerRef = useRef(null);

  useEffect(() => {
    let active = true;
    let eventVersion = 0;

    function acceptSession(nextSession) {
      if (!active) return;

      sessionRef.current = nextSession;
      setSession(nextSession);
      setSessionError(null);
      setInitializing(false);

      if (!nextSession) {
        profileControllerRef.current?.abort();

        setProfileState({
          token: null,
          profile: null,
          error: null,
          loading: false,
        });

        setPasswordRecovery(false);
      }
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!active) return;

        eventVersion += 1;

        // Keep this callback synchronous. Fetch the profile in an effect.
        acceptSession(nextSession);

        if (event === "PASSWORD_RECOVERY") {
          setPasswordRecovery(true);
        }
      },
    );

    const initialVersion = eventVersion;

    // Restore an existing browser session.
    // Ignore the result if a newer auth event has already arrived.
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || eventVersion !== initialVersion) {
          return;
        }

        if (error) {
          setSessionError(error);
          setInitializing(false);
          return;
        }

        acceptSession(data.session);
      })
      .catch((error) => {
        if (active && eventVersion === initialVersion) {
          setSessionError(error);
          setInitializing(false);
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
      profileControllerRef.current?.abort();
    };
  }, []);

  const accessToken = session?.access_token ?? null;

  const refreshProfile = useCallback(async () => {
    profileControllerRef.current?.abort();

    const expectedToken = accessToken;

    if (!expectedToken) {
      setProfileState({
        token: null,
        profile: null,
        error: null,
        loading: false,
      });

      return null;
    }

    const controller = new AbortController();
    profileControllerRef.current = controller;

    setProfileState({
      token: expectedToken,
      profile: null,
      error: null,
      loading: true,
    });

    function isCurrentRequest() {
      return (
        !controller.signal.aborted &&
        profileControllerRef.current === controller &&
        sessionRef.current?.access_token === expectedToken
      );
    }

    try {
      const profile = await api.getProfile({
        signal: controller.signal,
      });

      if (!isCurrentRequest()) return null;

      if (
        profile.id !== sessionRef.current?.user.id ||
        !["student", "teacher"].includes(profile.role)
      ) {
        throw new Error(
          "The backend returned an unexpected account profile.",
        );
      }

      setProfileState({
        token: expectedToken,
        profile,
        error: null,
        loading: false,
      });

      return profile;
    } catch (error) {
      if (isCurrentRequest() && !isCancelled(error)) {
        setProfileState({
          token: expectedToken,
          profile: null,
          error,
          loading: false,
        });
      }

      return null;
    }
  }, [accessToken]);

  useEffect(() => {
    void refreshProfile();

    return () => {
      profileControllerRef.current?.abort();
    };
  }, [refreshProfile]);

  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (error) throw error;

    return data;
  }, []);

  const signUp = useCallback(
    async ({ displayName, email, password }) => {
      const name = displayName.trim();

      if (!name || Array.from(name).length > 200) {
        throw new Error(
          "Enter a display name between 1 and 200 characters.",
        );
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo:
            `${window.location.origin}/auth/callback`,
          data: {
            display_name: name,
          },
        },
      });

      if (error) throw error;

      // No role is sent. The database creates a student profile.
      return data;
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({
      scope: "local",
    });

    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo:
          `${window.location.origin}/reset-password`,
      },
    );

    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password) => {
    const { data, error } = await supabase.auth.updateUser({
      password,
    });

    if (error) throw error;

    setPasswordRecovery(false);
    return data;
  }, []);

  // Never expose a previous session's profile to the current session.
  const profileMatchesSession =
    Boolean(accessToken) &&
    profileState.token === accessToken;

  const profile = profileMatchesSession
    ? profileState.profile
    : null;

  const profileError = profileMatchesSession
    ? profileState.error
    : null;

  const profileLoading =
    Boolean(accessToken) &&
    (!profileMatchesSession || profileState.loading);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,

      initializing,
      profileLoading,
      sessionError,
      profileError,
      passwordRecovery,

      // A browser session alone does not grant application access.
      authenticated: Boolean(session && profile),

      refreshProfile,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    }),
    [
      session,
      profile,
      initializing,
      profileLoading,
      sessionError,
      profileError,
      passwordRecovery,
      refreshProfile,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
      updatePassword,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      "useAuth must be used inside an AuthProvider.",
    );
  }

  return context;
}