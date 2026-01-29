// Next.js Middleware
// Protects routes and handles authentication redirects

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { AUTH_CONFIG } from "@/lib/auth/constants";

const AUTH_COOKIE_NAME = AUTH_CONFIG.COOKIE_NAME;
const REFRESH_COOKIE_NAME = AUTH_CONFIG.COOKIE_REFRESH_NAME;
const JWT_SECRET = process.env.JWT_SECRET;

// Routes that don't require authentication
const publicRoutes = ["/login"];

// API routes that don't require authentication
const publicApiRoutes = ["/api/auth/login", "/api/auth/logout", "/api/auth/session", "/api/auth/refresh"];

// Static assets and Next.js internals to skip (NOT /api/auth - we need to protect /api/auth/session)
const skipPaths = ["/_next", "/favicon.ico", "/images"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  console.log("[Middleware] ===================");
  console.log("[Middleware] Path:", pathname);
  console.log("[Middleware] URL:", request.url);

  // Skip middleware for static assets and Next.js internals
  if (skipPaths.some((path) => pathname.startsWith(path))) {
    console.log("[Middleware] Skipping static path");
    return NextResponse.next();
  }

  // Allow public routes without auth
  if (publicRoutes.includes(pathname)) {
    console.log("[Middleware] Public route, allowing access");
    return NextResponse.next();
  }

  // Allow public API routes without auth
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
    console.log("[Middleware] Public API route, allowing access");
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  console.log("[Middleware] Token exists:", !!token);

  if (!token) {
    // No access token; try refresh token before redirecting/logging out
    const refreshed = await tryRefresh(request);
    if (refreshed) return refreshed;

    // No token, redirect to login for page requests
    if (!pathname.startsWith("/api/")) {
      console.log("[Middleware] No token, redirecting to login from:", pathname);
      const loginUrl = new URL("/login", request.url);
      if (pathname !== "/") {
        loginUrl.searchParams.set("callbackUrl", pathname);
      }
      return NextResponse.redirect(loginUrl);
    }

    // Return 401 for API requests
    console.log("[Middleware] No token, returning 401 for API");
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // Verify token
  const isValid = await verifyToken(token);

  if (!isValid) {
    // Access token invalid/expired; try refresh token before redirecting/logging out
    const refreshed = await tryRefresh(request);
    if (refreshed) return refreshed;

    // Invalid token, clear cookie and redirect
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ success: false, message: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    // Clear invalid cookie
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  }

  // Token is valid, continue
  return NextResponse.next();
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    await jwtVerify(token, secretKey);
    return true;
  } catch {
    return false;
  }
}

async function tryRefresh(request: NextRequest): Promise<NextResponse | null> {
  const refreshToken = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  if (!refreshToken) return null;

  try {
    const secretKey = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(refreshToken, secretKey);

    // Must be a refresh token
    if (payload.type !== "refresh") return null;

    // Must carry user claims
    const sub = typeof payload.sub === "string" ? payload.sub : null;
    const username = typeof payload.username === "string" ? payload.username : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const role = typeof payload.role === "string" ? payload.role : null;

    if (!sub || !username || !email || !role) return null;

    // Issue a new access token
    const accessToken = await new SignJWT({
      sub,
      username,
      email,
      role,
      type: "access",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.JWT_EXPIRES_IN)
      .sign(secretKey);

    const response = NextResponse.next();
    response.cookies.set(AUTH_COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch {
    return null;
  }
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except static files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).)*",
    "/",
    "/api/:path*",
  ],
};
