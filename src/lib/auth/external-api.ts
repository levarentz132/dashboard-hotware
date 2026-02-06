// External Authentication API Configuration
// Handles communication with external license API

export const EXTERNAL_AUTH_API = {
  URL: process.env.EXTERNAL_AUTH_API_URL, // Base URL: http://16.78.105.192:3000
  TIMEOUT: 10000, // 10 seconds
};

export interface ExternalAuthRequest {
  username: string;
  password: string;
  system_id?: string; // Optional: validate user belongs to this system
  access_role?: string; // Optional: specify role context (e.g. 'owner') when logging in with system_id
}

export interface ExternalPrivilege {
  module: string;
  can_view: boolean;
  can_edit: boolean;
}

export interface ExternalOrganization {
  id: number;
  name: string;
  system_id: string;
}

export interface ExternalAuthResponse {
  success?: boolean;
  message?: string;
  error_code?: string;
  error_detail?: string;
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  user?: {
    id: number;
    username: string;
    email?: string;
    full_name?: string;
    role?: string; // Optional for backward compatibility
    system_id?: string; // The system ID this user is licensed for
    organizations?: ExternalOrganization[]; // New: organizations the user belongs to
    privileges?: ExternalPrivilege[]; // New: user's access privileges
    license_status: string; // e.g., "monthly", "yearly", "trial", "7_day", "expired", "ACTIVE"
    license_status_display?: string; // e.g., "Monthly", "Yearly", "7 Day"
    license_expires_at?: string | null;
    days_remaining?: number | null;
    last_login?: string | null;
    is_active?: boolean;
  };
}

/**
 * Map license status to user role
 */
export function mapLicenseToRole(licenseStatus: string): "admin" | "operator" | "viewer" {
  // Map license types to roles - customize as needed
  switch (licenseStatus.toLowerCase()) {
    case "active":
    case "yearly":
    case "lifetime":
      return "admin";
    case "monthly":
      return "operator";
    case "7_day":
    case "trial":
    default:
      return "viewer";
  }
}

/**
 * Base fetcher for external API
 */
async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_AUTH_API.TIMEOUT);

  try {
    if (!EXTERNAL_AUTH_API.URL) {
      throw new Error("EXTERNAL_AUTH_API_URL tidak dikonfigurasi");
    }

    // Ensure endpoint starts with /
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = `${EXTERNAL_AUTH_API.URL}${path}`;

    console.log(`[External API] Calling: ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // If it's a 204 No Content, return empty object
    if (response.status === 204) return { success: true };

    const contentType = response.headers.get("content-type");
    if (contentType && (contentType.includes("application/json") || contentType.includes("text/javascript"))) {
      const data = await response.json();

      // If the API doesn't return a success boolean but returns tokens, assume success
      if (data.access_token && data.success === undefined) {
        data.success = true;
      }

      return data;
    } else {
      // Return as text for public keys or other non-json responses
      const text = await response.text();
      return text;
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`[External API] Error calling ${endpoint}:`, error);
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Request timeout - server tidak merespon");
      }
      throw new Error(`Gagal menghubungi server: ${error.message}`);
    }
    throw new Error("Gagal menghubungi server autentikasi");
  }
}

/**
 * Call external authentication login API
 */
export async function callExternalAuthAPI(request: ExternalAuthRequest): Promise<ExternalAuthResponse> {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify(request),
  });

  // Ensure success is set if we have local tokens even if apiFetch didn't catch it
  if (data?.access_token && data.success === undefined) {
    data.success = true;
  }

  console.log("[External API] Login Response:", {
    success: data.success,
    message: data.message,
    has_token: !!data?.access_token,
  });

  return data;
}

/**
 * Refresh access token using external API
 */
export async function callExternalRefreshAPI(refreshToken: string): Promise<ExternalAuthResponse> {
  return await apiFetch("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

/**
 * Invalidate session with external API
 */
export async function callExternalLogoutAPI(refreshToken?: string): Promise<{ success: boolean; message: string }> {
  return await apiFetch("/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

/**
 * Retrieve the RSA public key to verify access tokens locally
 */
export async function getExternalPublicKey(): Promise<string> {
  const response = await apiFetch("/auth/public-key", { method: "GET" });

  // If the response is just the string, handle it. 
  // Based on user prompt, it returns the string directly or in some format.
  // "Retrieve the RSA public key to verify access tokens locally. GET http://localhost:3000/auth/public-key -----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----"

  if (typeof response === "string") return response;
  if (response.publicKey) return response.publicKey;
  if (response.key) return response.key;
  if (response.data) return response.data;

  return JSON.stringify(response);
}
/**
 * Create a new user/sub-account on the external API
 */
export async function callExternalCreateUser(
  token: string,
  userData: {
    username: string;
    password?: string;
    email: string;
    full_name?: string;
    org_id?: number | string;
    permissions: Record<string, "view" | "edit" | "none">;
  }
): Promise<{ success: boolean; message: string; data?: any }> {
  return await apiFetch("/create-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(userData),
  });
}

/**
 * Get current user profile and organization details from external API
 */
export async function getExternalMe(token: string): Promise<ExternalAuthResponse> {
  return await apiFetch("/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}
/**
 * Get users for an organization from external API
 * The API uses the token to determine the organization
 */
export async function callExternalGetUsers(
  token: string
): Promise<{ success: boolean; message: string; users?: any[] }> {
  return await apiFetch("/users", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Get single user detail + permissions from external API
 */
export async function callExternalGetUserDetail(
  token: string,
  userId: string | number
): Promise<{ success: boolean; message: string; user?: any }> {
  return await apiFetch(`/users/${userId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Edit an existing user on the external API
 */
export async function callExternalEditUser(
  token: string,
  userId: string | number,
  userData: {
    username?: string;
    password?: string;
    email?: string;
    full_name?: string;
    is_active?: boolean;
    permissions?: Record<string, "view" | "edit" | "none">;
  }
): Promise<{ success: boolean; message: string; data?: any }> {
  return await apiFetch("/edit-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      user_id: userId,
      ...userData
    }),
  });
}

/**
 * Delete a user on the external API
 */
export async function callExternalDeleteUser(
  token: string,
  userId: string | number
): Promise<{ success: boolean; message: string }> {
  return await apiFetch("/delete-user", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });
}
