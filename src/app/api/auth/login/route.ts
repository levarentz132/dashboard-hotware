// Login API Route
// POST /api/auth/login - Authenticate user with external license API

import { NextRequest, NextResponse } from "next/server";
import { generateTokens } from "@/lib/auth";
import { AUTH_CONFIG, AUTH_MESSAGES } from "@/lib/auth/constants";
import { callExternalAuthAPI, mapLicenseToRole } from "@/lib/auth/external-api";
import { getCloudAuthHeader } from "@/lib/config";
import { z } from "zod";
import type { UserPublic } from "@/lib/auth/types";

interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
}

// Fetch cloud systems to verify system_id
async function fetchCloudSystems(): Promise<CloudSystem[]> {
  try {
    const response = await fetch("https://meta.nxvms.com/cdb/systems", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: getCloudAuthHeader(),
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch cloud systems:", response.status);
      return [];
    }

    const data = await response.json();
    return data.systems || [];
  } catch (error) {
    console.error("Error fetching cloud systems:", error);
    return [];
  }
}

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
        { status: 400 },
      );
    }

    const { username, password } = validation.data;

    // Call external API for authentication
    const externalData = await callExternalAuthAPI({
      username,
      password,
    });

    // Check if login was successful
    if (!externalData.success) {
      // Handle specific error codes
      const isCredentialError = externalData.error_code !== "LICENSE_EXPIRED";
      const status = externalData.error_code === "LICENSE_EXPIRED" ? 403 : 401;

      return NextResponse.json(
        {
          success: false,
          message: isCredentialError ? AUTH_MESSAGES.LOGIN_FAILED : externalData.message || "Lisensi tidak valid",
          error_code: externalData.error_code,
        },
        { status },
      );
    }

    // Check if user data exists
    if (!externalData.user) {
      return NextResponse.json({ success: false, message: "Data pengguna tidak ditemukan" }, { status: 401 });
    }

    const userData = externalData.user;

    // Map license status to role, or use role from API if provided
    const role =
      userData.role === "admin" || userData.role === "operator" || userData.role === "viewer"
        ? userData.role
        : mapLicenseToRole(userData.license_status);

    // Check license expiration
    const isActive =
      userData.is_active &&
      userData.license_status !== "expired" &&
      (userData.days_remaining === null || userData.days_remaining > 0);

    // Transform external user data to our UserPublic format
    const user: UserPublic = {
      id: userData.id,
      username: userData.username,
      email: userData.email,
      role,
      system_id: userData.system_id, // Store the licensed system_id
      is_active: isActive,
      created_at: new Date(),
      last_login: userData.last_login ? new Date(userData.last_login) : new Date(),
    };

    // Check if license is expired or inactive
    if (!isActive) {
      const message =
        userData.license_status === "expired"
          ? `Lisensi Anda telah habis. Status: ${userData.license_status_display}`
          : userData.days_remaining !== null && userData.days_remaining <= 0
            ? `Lisensi Anda telah habis (${userData.license_status_display})`
            : "Akun Anda tidak aktif";

      return NextResponse.json({ success: false, message }, { status: 403 });
    }

    // Verify that user's system_id exists in cloud systems
    if (userData.system_id) {
      const cloudSystems = await fetchCloudSystems();
      const systemExists = cloudSystems.some((system) => system.id === userData.system_id);

      if (!systemExists) {
        return NextResponse.json(
          {
            success: false,
            message: `System ID "${userData.system_id}" tidak ditemukan di cloud. Hubungi administrator untuk memperbarui lisensi Anda.`,
            error_code: "SYSTEM_NOT_FOUND",
          },
          { status: 403 },
        );
      }
    } else {
      // If no system_id provided in license, reject login
      return NextResponse.json(
        {
          success: false,
          message: "Lisensi Anda tidak memiliki System ID yang valid. Hubungi administrator.",
          error_code: "NO_SYSTEM_ID",
        },
        { status: 403 },
      );
    }

    // Generate short-lived access token + long-lived refresh token
    const { accessToken, refreshToken } = await generateTokens(user);

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      message: "Login berhasil",
      user,
    });

    // Set HTTP-only cookie for access token (short-lived)
    response.cookies.set(AUTH_CONFIG.COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: AUTH_CONFIG.COOKIE_MAX_AGE,
      path: "/",
    });

    // Set HTTP-only cookie for refresh token (long-lived)
    if (refreshToken) {
      response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan pada server" }, { status: 500 });
  }
}
