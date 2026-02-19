// Logout API Route
// POST /auth/logout - Clear user session
// GET /auth/logout - Clear session and redirect to login

import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { callExternalLogoutAPI } from "@/lib/auth/external-api";
import { isSecureContext } from "@/lib/config";

function clearAuthCookies(response: NextResponse) {
  // Delete cookies by setting empty value with same attributes and maxAge 0
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

  // Also try delete as fallback
  response.cookies.delete(AUTH_CONFIG.COOKIE_NAME);
  response.cookies.delete(AUTH_CONFIG.COOKIE_REFRESH_NAME);
}

// GET - redirect to login after clearing cookies
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(AUTH_CONFIG.COOKIE_REFRESH_NAME)?.value;

  // Call external logout if possible
  if (refreshToken) {
    try {
      await callExternalLogoutAPI(refreshToken);
    } catch (e) {
      console.warn("External logout failed:", e);
    }
  }

  cookieStore.delete(AUTH_CONFIG.COOKIE_NAME);
  cookieStore.delete(AUTH_CONFIG.COOKIE_REFRESH_NAME);

  const response = NextResponse.redirect(new URL("/login", request.url));
  clearAuthCookies(response);
  return response;
}

// POST - JSON response
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(AUTH_CONFIG.COOKIE_REFRESH_NAME)?.value;

    // Call external logout if possible
    if (refreshToken) {
      try {
        await callExternalLogoutAPI(refreshToken);
      } catch (e) {
        console.warn("External logout failed:", e);
      }
    }

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
