// Authentication Context
// Provides authentication state and methods to entire application

"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AuthContextValue, AuthState, UserPublic, LoginCredentials, AuthResponse } from "@/lib/auth/types";
import { AUTH_ROUTES, AUTH_CONFIG } from "@/lib/auth/constants";
import nxAPI from "@/lib/nxapi";

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);
  const router = useRouter();

  // Check session on mount and periodically
  const checkSession = useCallback(async () => {
    try {
      const response = await fetch(AUTH_ROUTES.API_SESSION, {
        method: "GET",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success && data.isAuthenticated) {
        if (data.user?.system_id) {
          nxAPI.setSystemId(data.user.system_id);
        }
        setState({
          user: data.user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
      } else if (data.dbError || response.status === 503) {
        // Database error - keep current auth state, don't logout
        // The JWT token is still valid per middleware
        console.warn("Database temporarily unavailable, keeping current session");
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Database temporarily unavailable",
        }));
      } else {
        // Actual auth failure - logout
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
    } catch (error) {
      console.error("Session check error:", error);
      // Network error - keep current state, don't logout
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Network error",
      }));
    }
  }, []);

  // Initial session check
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Periodic session check
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const interval = setInterval(checkSession, AUTH_CONFIG.SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [state.isAuthenticated, checkSession]);

  // Login handler
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<AuthResponse> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch(AUTH_ROUTES.API_LOGIN, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(credentials),
        });

        const data = await response.json();

        if (data.success) {
          if (data.user?.system_id) {
            nxAPI.setSystemId(data.user.system_id);
          }
          setState({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          router.push(AUTH_ROUTES.DASHBOARD);
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: data.message,
          }));
        }

        return data;
      } catch (error) {
        const message = "Terjadi kesalahan saat login";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: message,
        }));
        return { success: false, message };
      }
    },
    [router],
  );

  // Logout handler
  const logout = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const response = await fetch(AUTH_ROUTES.API_LOGOUT, {
        method: "POST",
        credentials: "include",
      });

      // Wait for response to ensure cookies are cleared
      await response.json();

      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });

      // Hard redirect to login page
      window.location.replace(AUTH_ROUTES.LOGIN);
    } catch (error) {
      console.error("Logout error:", error);
      setState((prev) => ({ ...prev, isLoading: false }));
      // Still try to redirect even if there's an error
      window.location.replace(AUTH_ROUTES.LOGIN);
    }
  }, []);

  // Refresh session
  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(AUTH_ROUTES.API_REFRESH, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        // Token refresh failed, logout user
        await logout();
      }
    } catch (error) {
      console.error("Token refresh error:", error);
      await logout();
    }
  }, [logout]);

  // Clear error
  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshSession,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Export for convenience
export { AuthContext };
