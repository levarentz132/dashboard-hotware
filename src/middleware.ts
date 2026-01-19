// Next.js Middleware
// Protects routes and handles authentication redirects

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const AUTH_COOKIE_NAME = "auth_token";
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-change-in-production";

// Routes that don't require authentication
const publicRoutes = ["/login", "/register"];

// API routes that don't require authentication
const publicApiRoutes = ["/api/auth/login", "/api/auth/register"];

// Static assets and Next.js internals to skip
const skipPaths = ["/_next", "/favicon.ico", "/images", "/api/auth"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets and Next.js internals
  if (skipPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Allow public routes without auth
  if (publicRoutes.includes(pathname)) {
    // If user is already authenticated, redirect to dashboard
    const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const isValid = await verifyToken(token);
      if (isValid) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  // Allow public API routes without auth
  if (publicApiRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    // No token, redirect to login for page requests
    if (!pathname.startsWith("/api/")) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Return 401 for API requests
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // Verify token
  const isValid = await verifyToken(token);

  if (!isValid) {
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

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
