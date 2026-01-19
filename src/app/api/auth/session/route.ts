// Session API Route
// GET /api/auth/session - Validate current session and get user data

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;

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

    if (!session.valid) {
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
        secure: process.env.NODE_ENV === "production",
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

    // If token was refreshed, update the cookie
    if (session.newToken) {
      response.cookies.set(AUTH_CONFIG.COOKIE_NAME, session.newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Session API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
