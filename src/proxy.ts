// Next.js Middleware
// Protects routes and handles authentication redirects

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_CONFIG } from "@/lib/auth/constants";
import { verifyToken, refreshAccessToken } from "@/lib/auth/auth-service";
import { isSecureContext } from "@/lib/config";

const AUTH_COOKIE_NAME = AUTH_CONFIG.COOKIE_NAME;
const REFRESH_COOKIE_NAME = AUTH_CONFIG.COOKIE_REFRESH_NAME;

// Routes that don't require authentication
const publicRoutes = ["/login"];

// API routes that don't require authentication
const publicApiRoutes = ["/auth/login", "/auth/logout", "/auth/session", "/auth/refresh"];

// Static assets and Next.js internals to skip
const skipPaths = ["/_next", "/favicon.ico", "/images"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and Next.js internals
  if (skipPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow public routes without auth
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Allow public API routes without auth
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    // Allow Electron-verified requests to bypass JWT check for specific API routes
    const isElectronAuth = request.headers.get('x-electron-cloud-password');
    const isProxyRoute = pathname.startsWith('/api/nx') || pathname.startsWith('/api/cloud');

    if (isElectronAuth && isProxyRoute) {
      return NextResponse.next();
    }

    // No access token; try refresh token before redirecting/logging out
    const refreshed = await tryRefresh(request);
    if (refreshed) return refreshed;

    // No token, redirect to login for page requests
    if (!pathname.startsWith("/api/")) {
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/") {
        loginUrl.searchParams.set("callbackUrl", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }

    // Return 401 for API requests
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // Verify token (now uses RSA via getPublicKey in auth-service)
  const payload = await verifyToken(token);

  if (!payload) {
    // Access token invalid/expired; try refresh token
    const refreshed = await tryRefresh(request);
    if (refreshed) return refreshed;

    // Invalid token, clear cookie and redirect
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ success: false, message: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    // Clear invalid cookie
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      secure: isSecureContext(),
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  }

  // Token is valid, continue
  return NextResponse.next();
}

async function tryRefresh(request: NextRequest): Promise<NextResponse | null> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) return null;

  try {
    // Call our own refresh service (which calls the external API)
    const result = await refreshAccessToken(refreshToken);

    if (result.success && result.accessToken) {
      const response = NextResponse.next();

      // Update access token cookie
      response.cookies.set(AUTH_COOKIE_NAME, result.accessToken, {
        httpOnly: true,
        secure: isSecureContext(),
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
        path: "/",
      });

      // Update refresh token cookie if rotated
      if (result.refreshToken) {
        response.cookies.set(REFRESH_COOKIE_NAME, result.refreshToken, {
          httpOnly: true,
          secure: isSecureContext(),
          sameSite: "lax",
          maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
          path: "/",
        });
      }

      return response;
    }

    return null;
  } catch {
    return null;
  }
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).)*",
    "/",
    "/api/:path*",
    "/dashboard",
  ],
};
