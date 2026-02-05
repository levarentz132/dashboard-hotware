// External Authentication API Configuration
// Handles communication with external license API

export const EXTERNAL_AUTH_API = {
  URL: process.env.EXTERNAL_AUTH_API_URL,
  TIMEOUT: 10000, // 10 seconds
};

export interface ExternalAuthRequest {
  username: string;
  password: string;
  system_id?: string; // Optional: validate user belongs to this system
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
  success: boolean;
  message?: string;
  error_code?: string;
  error_detail?: string;
  user?: {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role?: string; // Optional for backward compatibility
    system_id: string; // The system ID this user is licensed for
    organizations?: ExternalOrganization[]; // New: organizations the user belongs to
    privileges?: ExternalPrivilege[]; // New: user's access privileges
    license_status: string; // e.g., "monthly", "yearly", "trial", "7_day", "expired"
    license_status_display: string; // e.g., "Monthly", "Yearly", "7 Day"
    license_expires_at: string | null;
    days_remaining: number | null;
    last_login: string | null;
    is_active: boolean;
  };
}

/**
 * Map license status to user role
 */
export function mapLicenseToRole(licenseStatus: string): "admin" | "operator" | "viewer" {
  // Map license types to roles - customize as needed
  switch (licenseStatus.toLowerCase()) {
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
 * Call external authentication API
 */
export async function callExternalAuthAPI(request: ExternalAuthRequest): Promise<ExternalAuthResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTERNAL_AUTH_API.TIMEOUT);

    console.log("[External API] Calling:", EXTERNAL_AUTH_API.URL);
    if (!EXTERNAL_AUTH_API.URL) {
      throw new Error("EXTERNAL_AUTH_API_URL tidak dikonfigurasi");
    }

    const response = await fetch(EXTERNAL_AUTH_API.URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse JSON response even for non-2xx status codes
    // PHP API returns 401 for authentication failures but includes error details
    const data = await response.json();
    console.log("[External API] Response:", {
      status: response.status,
      success: data.success,
      message: data.message,
      error_code: data.error_code,
    });

    return data;
  } catch (error) {
    console.error("[External API] Error:", error);
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Request timeout - server tidak merespon");
      }
      throw new Error(`Gagal menghubungi server: ${error.message}`);
    }
    throw new Error("Gagal menghubungi server autentikasi");
  }
}
