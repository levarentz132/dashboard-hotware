// Refresh Token API Route
// POST /api/auth/refresh - Refresh access token using refresh token

import { NextRequest, NextResponse } from "next/server";
import { refreshAccessToken } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(AUTH_CONFIG.COOKIE_REFRESH_NAME)?.value;

    if (!refreshToken) {
      return NextResponse.json(
        {
          success: false,
          message: AUTH_MESSAGES.INVALID_TOKEN,
        },
        { status: 401 }
      );
    }

    const result = await refreshAccessToken(refreshToken);

    if (!result.success) {
      const response = NextResponse.json(
        {
          success: false,
          message: result.message,
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

      response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, "", {
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
      message: "Token refreshed successfully",
    });

    // Set new access token
    if (result.accessToken) {
      response.cookies.set(AUTH_CONFIG.COOKIE_NAME, result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Refresh API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
