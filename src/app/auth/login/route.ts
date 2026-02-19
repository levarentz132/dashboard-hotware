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

import { getDynamicConfig, isSecureContext } from "@/lib/config";

// Fetch cloud systems to verify system_id
async function fetchCloudSystems(request?: Request): Promise<CloudSystem[]> {
  try {
    const response = await fetch("https://meta.nxvms.com/cdb/systems", {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: getCloudAuthHeader(request),
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
    const dynamicConfig = getDynamicConfig(request);

    // Prioritize system_id from Electron headers if missing from body
    if (!system_id && dynamicConfig?.NEXT_PUBLIC_NX_SYSTEM_ID) {
      system_id = dynamicConfig.NEXT_PUBLIC_NX_SYSTEM_ID;
      console.log(`[Login] Using system_id from Electron header: ${system_id}`);
    }

    console.log(`[Login Attempt] User: ${username}, Provided SystemID: ${system_id || "None"}`);

    // If system_id is not provided, try to detect it from cloud systems
    if (!system_id) {
      console.log("[Login] No system_id in request, attempting cloud detection...");
      const detectedSystems = await fetchCloudSystems(request);
      console.log(`[Login] Detected ${detectedSystems.length} systems from cloud`);

      if (detectedSystems.length > 0) {
        const onlineSystem = detectedSystems.find((s) => s.stateOfHealth === "online");
        system_id = onlineSystem ? onlineSystem.id : detectedSystems[0].id;
        console.log(`[Login] Auto-detected system_id: ${system_id} (${onlineSystem ? "online" : "fallback"})`);
      }
    }

    // 2. Handle Auto-Login or Identity Swap for Electron
    let externalData: any = null;
    const isAutoLogin = password === 'AUTO_LOGIN_CONTEXT';
    const localHash = dynamicConfig?.NEXT_PUBLIC_NX_CLOUD_PASSWORD || process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD;

    if (isAutoLogin && localHash) {
      console.log(`[Login] Executing Identity Swap for ${username}...`);
      externalData = {
        success: true,
        user: {
          username,
          email: username,
          role: 'admin',
          system_id,
          license_status: 'ACTIVE'
        }
      };
    } else {
      // Call external API for authentication
      const access_role = system_id ? "owner" : undefined;
      console.log(`[Login] Authenticating with External API: ${username} @ ${system_id || "Global"}`);
      externalData = await callExternalAuthAPI({
        username,
        password,
        system_id,
        access_role,
      });
    }

    // Check if login was successful (either success=true or we have an access_token)
    if (!externalData.success && !externalData.access_token) {
      // Handle specific error codes from external API
      let message: string = AUTH_MESSAGES.LOGIN_FAILED;
      let status = 401;

      if (externalData.error_code === "LICENSE_EXPIRED") {
        message = externalData.message || "Lisensi Anda telah berakhir";
        status = 403;
      } else if (externalData.error_code === "LICENSE_MISMATCH" || externalData.error_code === "SYSTEM_ID_MISMATCH") {
        message = AUTH_MESSAGES.LICENSE_MISMATCH;
        status = 403;
      } else if (externalData.error_code === "USER_NOT_FOUND" || externalData.error_code === "INVALID_PASSWORD") {
        // Obfuscate specific credential errors for security
        message = AUTH_MESSAGES.LOGIN_FAILED;
        status = 401;
      } else if (externalData.message) {
        // Use message from API if available but not a standard credential error
        message = externalData.message;
      }

      return NextResponse.json(
        {
          success: false,
          message: message,
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
    const privileges = (userData.privileges || []).map((p: any) => ({
      module: p.module,
      can_view: p.can_view,
      can_edit: p.can_edit,
    }));

    // Transform organizations from external API format
    const organizations = userData.organizations?.map((org: any) => ({
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

    // 1. Establish Dashboard Session
    response.cookies.set(AUTH_CONFIG.COOKIE_NAME, accessToken, {
      httpOnly: true,
      secure: isSecureContext(),
      sameSite: "lax",
      maxAge: externalData.expires_in || AUTH_CONFIG.COOKIE_MAX_AGE,
      path: "/",
    });

    if (refreshToken) {
      response.cookies.set(AUTH_CONFIG.COOKIE_REFRESH_NAME, refreshToken, {
        httpOnly: true,
        secure: isSecureContext(),
        sameSite: "lax",
        maxAge: AUTH_CONFIG.COOKIE_REFRESH_MAX_AGE,
        path: "/",
      });
    }

    // 2. Establish VMS Relay Session (Dual-Login)
    // Use VMS credentials from environment to establish relay session
    if (system_id) {
      try {
        // Get VMS credentials from environment (plain-text for dev, decrypt for Electron)
        const vmsUsername = dynamicConfig?.NEXT_PUBLIC_NX_USERNAME || process.env.NEXT_PUBLIC_NX_USERNAME;
        let vmsPassword: string | null = null;

        // Try to decrypt if encrypted password exists
        const vmsEncrypted = dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED || process.env.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED;
        if (vmsEncrypted) {
          // Import decryption function
          const crypto = require('crypto');
          const os = require('os');
          try {
            const machineId = os.hostname() + os.platform() + os.arch();
            const key = crypto.createHash('sha256').update(machineId).digest();
            const parts = vmsEncrypted.split(':');
            const iv = Buffer.from(parts[0], 'hex');
            const authTag = Buffer.from(parts[1], 'hex');
            const encrypted = parts[2];
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(authTag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            vmsPassword = decrypted;
            console.log(`[Dual-Login] Decrypted VMS password for relay login`);
          } catch (decryptError) {
            console.warn(`[Dual-Login] Decryption failed, using plain-text fallback`);
          }
        }

        // Fallback to plain-text password (dev environment or Electron legacy)
        if (!vmsPassword) {
          const rawPassword = dynamicConfig?.NEXT_PUBLIC_NX_PASSWORD || process.env.NEXT_PUBLIC_NX_PASSWORD;

          if (rawPassword && (rawPassword.startsWith('$2b$') || rawPassword.startsWith('$2y$') || rawPassword.length === 60)) {
            console.warn(`[Dual-Login] Detected bcrypt hash in VMS password field, ignoring for relay login`);
          } else {
            vmsPassword = rawPassword;
          }
        }

        if (vmsUsername && vmsPassword) {
          const relayLoginUrl = `https://${system_id}.relay.vmsproxy.com/rest/v3/login/sessions`;
          console.log(`[Dual-Login] Attempting relay login for ${system_id} with VMS user: ${vmsUsername}, password length: ${vmsPassword.length}`);

          const relayResponse = await fetch(relayLoginUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: vmsUsername, password: vmsPassword, setCookie: true }),
          });
          if (relayResponse.ok) {
            const relayData = await relayResponse.json();
            const relayToken = relayData.token || relayData.id;
            if (relayToken) {
              response.cookies.set(`nx-cloud-${system_id}`, relayToken, {
                path: "/",
                maxAge: 60 * 60 * 24 * 3, // 3 days
                httpOnly: false,
                secure: isSecureContext(),
                sameSite: "lax",
              });
              console.log(`[Dual-Login] ✓ Relay session established for ${system_id} with token: ${relayToken.substring(0, 8)}...`);
            }
          } else {
            const errorText = await relayResponse.text();
            console.warn(`[Dual-Login] Relay login failed (${relayResponse.status}): ${errorText}`);
          }
        } else {
          console.warn(`[Dual-Login] Missing VMS credentials for relay login`);
        }
      } catch (e) {
        console.error(`[Dual-Login] Relay login error:`, e);
      }
    }

    return response;
  } catch (error) {
    console.error("Login API error:", error);
    return NextResponse.json({ success: false, message: "Terjadi kesalahan pada server" }, { status: 500 });
  }
}