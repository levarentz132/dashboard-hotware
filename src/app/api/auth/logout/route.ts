// Logout API Route
// POST /api/auth/logout - Clear user session
// GET /api/auth/logout - Clear session and redirect to login

import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";

function clearAuthCookies(response: NextResponse) {
  // Delete cookies by setting empty value and maxAge 0
  response.cookies.delete(AUTH_CONFIG.COOKIE_NAME);
  response.cookies.delete(AUTH_CONFIG.COOKIE_REFRESH_NAME);
}

// GET - redirect to login after clearing cookies
export async function GET(request: NextRequest) {
  // Also try using cookies() API to delete
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_CONFIG.COOKIE_NAME);
  cookieStore.delete(AUTH_CONFIG.COOKIE_REFRESH_NAME);

  const response = NextResponse.redirect(new URL("/login", request.url));
  clearAuthCookies(response);
  return response;
}

// POST - JSON response
export async function POST() {
  try {
    const response = NextResponse.json({
      success: true,
      message: AUTH_MESSAGES.LOGOUT_SUCCESS,
    });
    clearAuthCookies(response);
    return response;
  } catch (error) {
    console.error("Logout API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
