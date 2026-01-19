// Logout API Route
// POST /api/auth/logout - Clear user session

import { NextResponse } from "next/server";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";

export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: AUTH_MESSAGES.LOGOUT_SUCCESS,
    });

    // Clear auth cookies
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
  } catch (error) {
    console.error("Logout API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
