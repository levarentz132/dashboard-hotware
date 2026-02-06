// Token Refresh API Route
// POST /auth/refresh - Exchange refresh token for new access/refresh tokens

import { NextRequest, NextResponse } from "next/server";
import { AUTH_CONFIG } from "@/lib/auth/constants";
import { callExternalRefreshAPI } from "@/lib/auth/external-api";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = request.cookies.get(AUTH_CONFIG.COOKIE_REFRESH_NAME)?.value;

    if (!refreshToken) {
      return NextResponse.json({ success: false, message: "Refresh token tidak ditemukan" }, { status: 401 });
    }

    // Call external API for token refresh
    const data = await callExternalRefreshAPI(refreshToken);

    if (!data.success || !data.access_token) {
      return NextResponse.json(
        { success: false, message: data.message || "Gagal menyegarkan token" },
        { status: 401 },
      );
    }

    // Create response
    const response = NextResponse.json({
      success: true,
      message: "Token berhasil diperbarui",
    });

    // Set HTTP-only cookie for access token (short-lived)
    response.cookies.set(AUTH_CONFIG.COOKIE_NAME, data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: data.expires_in || AUTH_CONFIG.COOKIE_MAX_AGE,
      path: "/",
    });

    // Set HTTP-only cookie for refresh token (long-lived) - Rotation
    if (data.refresh_token) {
      response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Refresh API error:", error);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan pada server" }, { status: 500 });
  }
}
