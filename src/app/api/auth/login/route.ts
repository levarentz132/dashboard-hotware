// Login API Route
// POST /api/auth/login - Authenticate user with credentials

import { NextRequest, NextResponse } from "next/server";
import { loginUser } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1, "Username harus diisi"),
  password: z.string().min(1, "Password harus diisi"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = loginSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: AUTH_MESSAGES.VALIDATION_ERROR,
          errors: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { username, password } = validation.data;

    // Attempt login
    const result = await loginUser({ username, password });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 401 });
    }

    // Create response with tokens
    const response = NextResponse.json({
      success: true,
      message: result.message,
      user: result.user,
    });

    // Set HTTP-only cookie for access token
    if (result.tokens) {
      response.cookies.set(AUTH_CONFIG.COOKIE_NAME, result.tokens.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
        path: "/",
      });

      // Set refresh token cookie
      if (result.tokens.refreshToken) {
        response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
          path: "/",
        });
      }
    }

    return response;
  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
