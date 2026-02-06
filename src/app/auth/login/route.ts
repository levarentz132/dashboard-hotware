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

    const { username, password, system_id } = validation.data;

    // Call external API for authentication
    const externalData = await callExternalAuthAPI({
      username,
      password,
      system_id,
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

    // Verify or bind system_id
    if (userData.system_id) {
      const cloudSystems = await fetchCloudSystems();

      // If we can fetch cloud systems, verify the ID exists
      if (cloudSystems.length > 0) {
        const systemExists = cloudSystems.some((system) => system.id === userData.system_id);

        if (!systemExists) {
          console.warn(`[Login] System ID "${userData.system_id}" from license not found in cloud systems.`);
          // We'll proceed anyway if the license says it's active, but log the discrepancy
        }
      } else {
        console.warn("[Login] Could not fetch/verify cloud systems, proceeding with license data.");
      }
    } else {
      // If no system_id provided in license, try to find one from cloud systems and bind it
      const cloudSystems = await fetchCloudSystems();

      if (cloudSystems.length > 0) {
        // If there are systems, pick the first one (prefer 'online' state)
        const onlineSystem = cloudSystems.find((s) => s.stateOfHealth === "online");
        const selectedSystem = onlineSystem || cloudSystems[0];
        const currentSystemId = selectedSystem.id;

        console.log(`[Login] System ID not set in license. Binding to system: ${currentSystemId} (${selectedSystem.name})`);

        // Post back to external API to store this system ID
        try {
          let updateData = await callExternalAuthAPI({
            username,
            password,
            system_id: currentSystemId,
          });

          // Add a small delay as requested to handle potential server propagation
          await new Promise((resolve) => setTimeout(resolve, 1000));

          if (updateData.success && updateData.user?.system_id) {
            // Update local state with the newly bound system_id
            userData.system_id = updateData.user.system_id;
            user.system_id = updateData.user.system_id;
            console.log(`[Login] Successfully bound system ID: ${userData.system_id}`);

            // If the re-login provided new tokens, use them
            if (updateData.access_token) {
              externalData.access_token = updateData.access_token;
              externalData.refresh_token = updateData.refresh_token;
            }
          } else {
            console.warn("[Login] Binding system ID failed:", updateData.message);
            // Don't block login if the user is authenticated, just log it
          }
        } catch (error) {
          console.error("[Auth] Error during system ID binding:", error);
          // Don't block login on binding error if authentication was successful
        }
      } else {
        console.warn("[Login] No system_id in license and no cloud systems available to bind.");
      }
    }

    // Use tokens from external API
    const accessToken = externalData.access_token;
    const refreshToken = externalData.refresh_token;

    if (!accessToken) {
      return NextResponse.json({ success: false, message: "Server tidak memberikan token akses" }, { status: 500 });
    }

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
