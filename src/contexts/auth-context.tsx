// Authentication Context
// Provides authentication state and methods to entire application

"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  AuthContextValue,
  AuthState,
  UserPublic,
  LoginCredentials,
  AuthResponse,
} from "@/lib/auth/types";
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

  // Helper to get Electron headers
  const getElectronHeaders = useCallback((): Record<string, string> => {
    const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;
    if (!extConfig) return {};

    return {
      'X-Electron-System-ID': extConfig.NEXT_PUBLIC_NX_SYSTEM_ID || '',
      'X-Electron-Username': extConfig.NEXT_PUBLIC_NX_USERNAME || '',
      'X-Electron-VMS-Password': extConfig.NEXT_PUBLIC_NX_PASSWORD || '',
      'X-Electron-VMS-Password-Encrypted': extConfig.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED || '',
      'X-Electron-Cloud-Username': extConfig.NEXT_PUBLIC_NX_CLOUD_USERNAME || '',
      'X-Electron-Cloud-Password': extConfig.NEXT_PUBLIC_NX_CLOUD_PASSWORD || '',
      'X-Electron-Cloud-Password-Encrypted': extConfig.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED || '',
      'X-Electron-Cloud-Token': extConfig.NX_CLOUD_TOKEN || '',
    };
  }, []);

  // Check session on mount and periodically
  const checkSession = useCallback(async () => {
    try {
      const response = await fetch(AUTH_ROUTES.API_SESSION, {
        method: "GET",
        headers: {
          ...getElectronHeaders()
        },
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
        // (debug logs removed)
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
        // Auth failure — if license is expired or session is invalid, force a full logout
        // to clear cookies and redirect. Merely setting state is not enough because
        // the session cookie (which drives middleware) would remain valid.
        if (data.licenseExpired) {
          console.warn("[Auth] License expired. Forcing logout.");
          setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: data.message || "License expired",
          });
          // Force full logout to clear cookies and redirect to login
          try {
            await fetch(AUTH_ROUTES.API_LOGOUT, { method: "POST", credentials: "include" });
          } catch (_) { /* best-effort */ }
          if (typeof window !== "undefined") {
            window.location.replace(AUTH_ROUTES.LOGIN);
          }
          return data;
        }
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
        });
      }
      return data;
    } catch (error) {
      console.error("Session check error:", error);
      // Network error - keep current state, don't logout
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Network error",
      }));
      return { success: false, isAuthenticated: false };
    }
  }, []);

  // Initial session check
  useEffect(() => {
    let isInitialCheck = true;
    
    const initAuth = async () => {
      // 1. First check if we already have a valid session cookie
      const sessionData = await checkSession();
      
      // 2. If in Electron and not authenticated, attempt Auto-Login using local config
      const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;
      if (extConfig && isInitialCheck) {
        // We only attempt auto-login if the session check explicitly failed
        if (sessionData && !sessionData.isAuthenticated) {
          console.log("[Auth] Electron detected and session invalid, attempting Auto-Login...");
          login({
            username: extConfig.NEXT_PUBLIC_NX_CLOUD_USERNAME || '',
            password: 'AUTO_LOGIN_CONTEXT', 
            system_id: extConfig.NEXT_PUBLIC_NX_SYSTEM_ID
          });
        }
      }
      isInitialCheck = false;
    };

    initAuth();
  }, [checkSession]); // login is omitted to avoid loop, it's stable anyway

  // Periodic session check
  useEffect(() => {
    if (!state.isAuthenticated) return;

    const interval = setInterval(checkSession, AUTH_CONFIG.SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [state.isAuthenticated, checkSession]);

  // License expiry watcher — triggers as soon as the user object reflects an expired license.
  // Uses date comparison (same as TopBar's isLicenseExpired) so it catches expiry even when
  // license_status is still "ACTIVE" but license_expires_at is in the past.
  useEffect(() => {
    if (!state.user || !state.isAuthenticated) return;

    const licenseStatus = (state.user.license_status || "").toLowerCase();
    const daysRemaining = (state.user as any).days_remaining;

    // Date-based expiry check (mirrors TopBar's isLicenseExpired logic)
    const licenseExpiresAt =
      (state.user as any).license_expires_at ||
      (state.user as any).organization?.license_expires_at;
    const isDateExpired = licenseExpiresAt
      ? (() => {
          try {
            const d = new Date(licenseExpiresAt);
            return !isNaN(d.getTime()) && d < new Date();
          } catch { return false; }
        })()
      : false;

    const isExpired =
      licenseStatus === "expired" ||
      isDateExpired ||
      (typeof daysRemaining === "number" && daysRemaining <= 0);

    if (isExpired && licenseStatus !== "active") {
      console.warn("[Auth] License expiry detected in user state. Forcing logout.");
      (async () => {
        try {
          await fetch(AUTH_ROUTES.API_LOGOUT, { method: "POST", credentials: "include" });
        } catch (_) { /* best-effort */ }
        if (typeof window !== "undefined") {
          window.location.replace(AUTH_ROUTES.LOGIN);
        }
      })();
    }
  }, [state.user, state.isAuthenticated]);

  // Login handler
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<AuthResponse> => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch(AUTH_ROUTES.API_LOGIN, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getElectronHeaders()
          },
          credentials: "include",
          body: JSON.stringify(credentials),
        });

        const data = await response.json();

        if (data.success) {
          if (data.user?.system_id) {
            nxAPI.setSystemId(data.user.system_id);
          }
          // Force sidebar to be collapsed when entering the app
          if (typeof window !== 'undefined') {
            localStorage.setItem("sidebar-collapsed", "true");
          }
          setState({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          router.replace(AUTH_ROUTES.DASHBOARD);
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
    [router]
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
