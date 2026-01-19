// Register API Route
// POST /api/auth/register - Create new user account

import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { z } from "zod";

const registerSchema = z.object({
  username: z
    .string()
    .min(3, "Username minimal 3 karakter")
    .max(50, "Username maksimal 50 karakter")
    .regex(/^[a-zA-Z0-9_]+$/, "Username hanya boleh mengandung huruf, angka, dan underscore"),
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(AUTH_CONFIG.MIN_PASSWORD_LENGTH, AUTH_MESSAGES.PASSWORD_TOO_SHORT),
  role: z.enum(["admin", "operator", "viewer"]).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validation = registerSchema.safeParse(body);
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

    const { username, email, password, role } = validation.data;

    // Attempt registration
    const result = await registerUser({ username, email, password, role });

    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 400 });
    }

    // Create response with tokens
    const response = NextResponse.json(
      {
        success: true,
        message: result.message,
        user: result.user,
      },
      { status: 201 }
    );

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
    console.error("Register API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
