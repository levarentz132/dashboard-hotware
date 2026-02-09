// Login API Route
// POST /auth/login - Authenticate user with external license API

import { NextRequest, NextResponse } from "next/server";
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
  system_id: z.string().optional(),
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

    let { username, password, system_id } = validation.data;
    console.log(`[Login Attempt] User: ${username}, Provided SystemID: ${system_id || "None"}`);

    // If system_id is not provided, try to detect it from cloud systems
    if (!system_id) {
      console.log("[Login] No system_id in request, attempting cloud detection...");
      const detectedSystems = await fetchCloudSystems();
      console.log(`[Login] Detected ${detectedSystems.length} systems from cloud`);

      if (detectedSystems.length > 0) {
        const onlineSystem = detectedSystems.find((s) => s.stateOfHealth === "online");
        system_id = onlineSystem ? onlineSystem.id : detectedSystems[0].id;
        console.log(`[Login] Auto-detected system_id: ${system_id} (${onlineSystem ? "online" : "fallback"})`);
      }
    }

    // Call external API for authentication
    const access_role = system_id ? "owner" : undefined;
    console.log(`[Login] Sending request to External API with system_id: ${system_id || "MISSING"}, role: ${access_role || "default"}`);
    const externalData = await callExternalAuthAPI({
      username,
      password,
      system_id,
      access_role,
    });

    // Check if login was successful (either success=true or we have an access_token)
    if (!externalData.success && !externalData.access_token) {
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

    // If the server didn't explicitly return the system_id in the user object, 
    // but the login succeeded and we provided a system_id, trust that it's now associated.
    if (userData && !userData.system_id && system_id && (externalData.success || externalData.access_token)) {
      userData.system_id = system_id;
      console.log(`[Login] Using requested system_id: ${system_id}`);
    }

    // Map license status to role for backward compatibility
    const role =
      userData.role === "admin" || userData.role === "operator" || userData.role === "viewer"
        ? (userData.role as any)
        : mapLicenseToRole(userData.license_status || "");

    // Check license expiration
    const isActive =
      userData.is_active !== false &&
      userData.license_status?.toLowerCase() !== "expired" &&
      (userData.days_remaining === undefined || userData.days_remaining === null || userData.days_remaining > 0);

    // Transform privileges from external API format
    const privileges = userData.privileges?.map((p) => ({
      module: p.module,
      can_view: p.can_view,
      can_edit: p.can_edit,
    }));

    // Transform organizations from external API format
    const organizations = userData.organizations?.map((org) => ({
      id: org.id,
      name: org.name,
      system_id: org.system_id,
    }));

    // Transform external user data to our UserPublic format
    const user: UserPublic = {
      id: userData.id,
      username: userData.username,
      email: userData.email || "",
      full_name: userData.full_name || userData.username,
      role, // Keep for backward compatibility
      system_id: userData.system_id || "",
      organizations, // Store organizations
      privileges, // Store privileges
      is_active: isActive,
      created_at: new Date(),
      last_login: userData.last_login ? new Date(userData.last_login) : new Date(),
    };

    // Check if license is expired or inactive
    if (!isActive && userData.license_status !== "ACTIVE") {
      const message =
        userData.license_status === "expired"
          ? `Lisensi Anda telah habis. Status: ${userData.license_status_display || "Expired"}`
          : userData.days_remaining !== null && userData.days_remaining !== undefined && userData.days_remaining <= 0
            ? `Lisensi Anda telah habis (${userData.license_status_display || "Expired"})`
            : "Akun Anda tidak aktif";

      return NextResponse.json({ success: false, message }, { status: 403 });
    }


    // Use tokens from external API
    const accessToken = externalData.access_token;
    const refreshToken = externalData.refresh_token;

    if (!accessToken) {
      return NextResponse.json({ success: false, message: "Server tidak memberikan token akses" }, { status: 500 });
    }

    // Attempt to enrich user data from /me endpoint immediately
    // This ensures permissions and role objects are correct from the very first response
    let finalUser = user;
    try {
      const { getExternalMe } = await import("@/lib/auth/external-api");
      const profileData = await getExternalMe(accessToken);
      if (profileData && profileData.user) {
        // Merge with profile data for more accuracy
        finalUser = {
          ...user,
          ...profileData.user,
          id: Number(profileData.user.id),
          role: profileData.user.role as any, // Cast to any to handle string/object
          created_at: profileData.user.created_at || user.created_at,
          last_login: profileData.user.last_login || user.last_login as any,
        };
        console.log(`[Login] User profile enriched from /me for ${finalUser.username}`);
      }
    } catch (profileError) {
      console.warn("[Login] Could not enrich profile from /me:", profileError);
      // Proceed with basic user info from login
    }

    // Create response with user data
    const response = NextResponse.json({
      success: true,
      message: "Login berhasil",
      user: finalUser,
    });

    // Set HTTP-only cookie for access token (short-lived)
    response.cookies.set(AUTH_CONFIG.COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: externalData.expires_in || AUTH_CONFIG.COOKIE_MAX_AGE,
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