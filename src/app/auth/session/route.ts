// Session API Route
// GET /auth/session - Validate current session and get user data

import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, validateSession } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { isSecureContext } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    let token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    const refreshToken = request.cookies.get(
      AUTH_CONFIG.COOKIE_REFRESH_NAME,
    )?.value;
    let rotatedAccessToken: string | null = null;
    let rotatedRefreshToken: string | null = null;

    // >>> ADDED: read the persistent login_source cookie set during /auth/login.
    // This is what makes cloud/local survive refresh + the periodic checkSession() poll.
    const loginSource: "cloud" | "local" =
      request.cookies.get("login_source")?.value === "cloud"
        ? "cloud"
        : "local";

    // If no/expired access token, try to refresh using refresh token
    if (!token && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed.success && refreshed.accessToken) {
        token = refreshed.accessToken;
        rotatedAccessToken = refreshed.accessToken;
        rotatedRefreshToken = refreshed.refreshToken ?? null;
      }
    }

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          isAuthenticated: false,
          message: AUTH_MESSAGES.UNAUTHORIZED,
        },
        { status: 403 },
      );
    }

    const session = await validateSession(token);

    if (session.valid && session.user) {
      // Try to get freshest user data from /me endpoint if requested or by default
      try {
        const { getExternalMe } = await import("@/lib/auth/external-api");
        const meResult = await getExternalMe(token);
        if (meResult && meResult.user) {
          // Merge JWT data with freshest API data
          session.user = {
            ...session.user,
            ...meResult.user,
            organization: meResult.organization || session.user.organization,
            // Ensure ID is number and role is typed correctly
            id: Number(meResult.user.id),
            role: meResult.user.role as any,
          };

          // Check for license expiration AFTER enrichment — using the final merged user object
          const licenseStatus = (
            session.user.license_status || ""
          ).toLowerCase();
          const daysRemaining = (session.user as any).days_remaining;
          const licenseExpiresAt =
            (session.user as any).license_expires_at ||
            (session.user as any).organization?.license_expires_at;

          // Date-based check (mirrors TopBar's isLicenseExpired logic)
          const isDateExpired = licenseExpiresAt
            ? (() => {
                try {
                  const d = new Date(licenseExpiresAt);
                  return !isNaN(d.getTime()) && d < new Date();
                } catch {
                  return false;
                }
              })()
            : false;

          const isActuallyActive =
            (session.user as any).is_active !== false &&
            licenseStatus !== "expired" &&
            !isDateExpired &&
            (daysRemaining === undefined ||
              daysRemaining === null ||
              daysRemaining > 0);

          if (!isActuallyActive && licenseStatus !== "active") {
            return NextResponse.json(
              {
                success: false,
                isAuthenticated: false,
                message: `Lisensi Anda telah habis. Status: ${(session.user as any).license_status_display || "Expired"}`,
                licenseExpired: true,
              },
              { status: 403 },
            );
          }
        }
      } catch (meError) {
        console.warn(
          "[Session API] Failed to enrich user data from /me:",
          meError,
        );
        // Continue with JWT data if enrichment fails
      }
    }

    if (!session.valid) {
      // Access token invalid/expired - try refresh once
      if (refreshToken) {
        const refreshed = await refreshAccessToken(refreshToken);

        if (refreshed.success && refreshed.accessToken) {
          const refreshedSession = await validateSession(refreshed.accessToken);
          if (refreshedSession.valid && refreshedSession.user) {
            // Also enrich the refreshed session user
            try {
              const { getExternalMe } = await import("@/lib/auth/external-api");
              const meResult = await getExternalMe(refreshed.accessToken);
              if (meResult && meResult.user) {
                // Check for license expiration
                const licenseStatus = (
                  meResult.user.license_status || ""
                ).toLowerCase();
                const daysRemaining = meResult.user.days_remaining;
                const isActuallyActive =
                  meResult.user.is_active !== false &&
                  licenseStatus !== "expired" &&
                  (daysRemaining === undefined ||
                    daysRemaining === null ||
                    daysRemaining > 0);

                if (!isActuallyActive && licenseStatus !== "active") {
                  return NextResponse.json(
                    {
                      success: false,
                      isAuthenticated: false,
                      message: `Lisensi Anda telah habis. Status: ${meResult.user.license_status_display || "Expired"}`,
                      licenseExpired: true,
                    },
                    { status: 403 },
                  );
                }

                refreshedSession.user = {
                  ...refreshedSession.user,
                  ...meResult.user,
                  organization:
                    meResult.organization || refreshedSession.user.organization,
                  id: Number(meResult.user.id),
                  role: meResult.user.role as any,
                };
              }
            } catch (e) {}

            const response = NextResponse.json({
              success: true,
              isAuthenticated: true,
              user: { ...refreshedSession.user, loginSource }, // >>> ADDED
            });

            response.cookies.set(
              AUTH_CONFIG.COOKIE_NAME,
              refreshed.accessToken,
              {
                httpOnly: true,
                secure: isSecureContext(),
                sameSite: "lax",
                maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
                path: "/",
              },
            );

            if (refreshed.refreshToken) {
              response.cookies.set(
                AUTH_CONFIG.COOKIE_REFRESH_NAME,
                refreshed.refreshToken,
                {
                  httpOnly: true,
                  secure: isSecureContext(),
                  sameSite: "lax",
                  maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
                  path: "/",
                },
              );
            }

            return response;
          }
        }
      }

      const response = NextResponse.json(
        {
          success: false,
          isAuthenticated: false,
          message: AUTH_MESSAGES.SESSION_EXPIRED,
        },
        { status: 403 },
      );

      // Clear invalid cookies
      response.cookies.set(AUTH_CONFIG.COOKIE_NAME, "", {
        httpOnly: true,
        secure: isSecureContext(),
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });
      response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, "", {
        httpOnly: true,
        secure: isSecureContext(),
        sameSite: "lax",
        maxAge: 0,
        path: "/",
      });

      return response;
    }

    const response = NextResponse.json({
      success: true,
      isAuthenticated: true,
      user: { ...session.user, loginSource }, // >>> ADDED
    });

    // If we rotated tokens earlier in this request, persist them now
    if (rotatedAccessToken) {
      response.cookies.set(AUTH_CONFIG.COOKIE_NAME, rotatedAccessToken, {
        httpOnly: true,
        secure: isSecureContext(),
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
        path: "/",
      });
    }
    if (rotatedRefreshToken) {
      response.cookies.set(
        AUTH_CONFIG.COOKIE_REFRESH_NAME,
        rotatedRefreshToken,
        {
          httpOnly: true,
          secure: isSecureContext(),
          sameSite: "lax",
          maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
          path: "/",
        },
      );
    }

    return response;
  } catch (error) {
    console.error("Session API error:", error);

    const isDbError =
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "ECONNREFUSED" ||
        error.code === "ETIMEDOUT" ||
        error.code === "ENOTFOUND");

    if (isDbError) {
      return NextResponse.json(
        {
          success: false,
          message: "Database temporarily unavailable. Please try again.",
          dbError: true,
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { success: false, message: AUTH_MESSAGES.SERVER_ERROR },
      { status: 500 },
    );
  }
}
