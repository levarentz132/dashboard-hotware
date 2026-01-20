// Register API Route
// POST /api/auth/register - Create new user account via external API

import { NextRequest, NextResponse } from "next/server";
import { signJWT } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { callExternalAuthAPI } from "@/lib/auth/external-api";
import { z } from "zod";
import type { UserPublic } from "@/lib/auth/types";

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

    // Registration is not supported via external API
    // Users must be created through the license management system
    return NextResponse.json(
      { 
        success: false, 
        message: "Registrasi tidak tersedia. Silakan hubungi administrator untuk mendapatkan akses." 
      },
      { status: 403 }
    );

    return response;
  } catch (error) {
    console.error("Register API error:", error);
    return NextResponse.json({ success: false, message: AUTH_MESSAGES.SERVER_ERROR }, { status: 500 });
  }
}
