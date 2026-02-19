// Session API Route
// GET /auth/session - Validate current session and get user data

import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken, validateSession } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { isSecureContext } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    let token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    const refreshToken = request.cookies.get(AUTH_CONFIG.COOKIE_REFRESH_NAME)?.value;
    let rotatedAccessToken: string | null = null;
    let rotatedRefreshToken: string | null = null;

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
        { status: 401 }
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
            // Ensure ID is number and role is typed correctly
            id: Number(meResult.user.id),
            role: meResult.user.role as any,
          };
          console.log(`[Session API] Enriched user data from /me for ${session.user?.username}`);
        }
      } catch (meError) {
        console.warn("[Session API] Failed to enrich user data from /me:", meError);
        // Continue with JWT data if enrichment fails
      }
    }

    if (!session.valid) {
      // Access token invalid/expired - try refresh once
      if (refreshToken) {
        console.log("[Session API] Access token invalid/expired. Attempting refresh...");
        const refreshed = await refreshAccessToken(refreshToken);

        if (refreshed.success && refreshed.accessToken) {
          console.log("[Session API] Refresh successful. Rotating tokens.");
          const refreshedSession = await validateSession(refreshed.accessToken);
          if (refreshedSession.valid && refreshedSession.user) {
            // Also enrich the refreshed session user
            try {
              const { getExternalMe } = await import("@/lib/auth/external-api");
              const meResult = await getExternalMe(refreshed.accessToken);
              if (meResult && meResult.user) {
                refreshedSession.user = {
                  ...refreshedSession.user,
                  ...meResult.user,
                  id: Number(meResult.user.id),
                  role: meResult.user.role as any,
                };
              }
            } catch (e) { }

            const response = NextResponse.json({
              success: true,
              isAuthenticated: true,
              user: refreshedSession.user,
            });

            response.cookies.set(AUTH_CONFIG.COOKIE_NAME, refreshed.accessToken, {
              httpOnly: true,
              secure: isSecureContext(),
              sameSite: "lax",
              maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
              path: "/",
            });

            if (refreshed.refreshToken) {
              response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, refreshed.refreshToken, {
                httpOnly: true,
                secure: isSecureContext(),
                sameSite: "lax",
                maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
                path: "/",
              });
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
        { status: 401 }
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
      user: session.user,
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
      response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, rotatedRefreshToken, {
        httpOnly: true,
        secure: isSecureContext(),
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Session API error:", error);

    // Check if it's a database connection error
    const isDbError = error && typeof error === 'object' && 'code' in error &&
      (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND');

    if (isDbError) {
      // Database unavailable - don't invalidate session, just return error
      // The middleware already validated the JWT token, so session is technically valid
      return NextResponse.json(
        {
          success: false,
          message: 'Database temporarily unavailable. Please try again.',
          dbError: true // Flag to indicate DB error vs auth error
        },
        { status: 503 } // Service Unavailable
      );
    }

    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
