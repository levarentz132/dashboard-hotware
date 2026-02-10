// useRequireAuth Hook
// Protects client components by requiring authentication

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./use-auth";
import { AUTH_ROUTES } from "@/lib/auth/constants";
import type { UserRole } from "@/lib/auth/types";

interface UseRequireAuthOptions {
  redirectTo?: string;
  requiredRole?: UserRole | UserRole[];
}

export function useRequireAuth(options: UseRequireAuthOptions = {}) {
  const { redirectTo = AUTH_ROUTES.LOGIN, requiredRole } = options;
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push(redirectTo);
      return;
    }

    // Check role if specified
    if (requiredRole && user) {
      const allowedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      const userRole: UserRole | undefined = typeof user.role === "object" ? (user.role?.name as UserRole) : user.role;

      if (!userRole || !allowedRoles.includes(userRole)) {
        // User doesn't have required role
        router.push(AUTH_ROUTES.DASHBOARD);
      }
    }
  }, [isAuthenticated, isLoading, user, router, redirectTo, requiredRole]);

  const getUserRole = (u: typeof user): UserRole | undefined =>
    u ? (typeof u.role === "object" ? (u.role?.name as UserRole) : u.role) : undefined;

  return {
    user,
    isAuthenticated,
    isLoading,
    hasAccess:
      isAuthenticated &&
      (!requiredRole ||
        (user &&
          (() => {
            const r = getUserRole(user);
            return r && (Array.isArray(requiredRole) ? requiredRole.includes(r) : r === requiredRole);
          })())),
  };
}
