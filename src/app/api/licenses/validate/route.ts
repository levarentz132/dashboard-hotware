// License Validation API
// POST /api/licenses/validate?action=activate - Activate a license
// POST /api/licenses/validate?action=deactivate - Deactivate current license
// GET /api/licenses/validate?action=status - Check license status

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const LICENSE_COOKIE_NAME = "license_data";
const LICENSE_API_URL = process.env.LICENSE_API_URL || "http://localhost:3000";

interface LicenseFromAPI {
  id: string;
  licenseKey: string;
  productId: string;
  productName: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  status: string;
  type: string;
  maxActivations: number;
  currentActivations: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

interface StoredLicenseData {
  id: string;
  licenseKey: string;
  productName: string;
  userEmail: string | null;
  userName: string | null;
  status: string;
  type: string;
  maxActivations: number;
  currentActivations: number;
  expiresAt: string;
  activatedAt: string;
  isValid: boolean;
}

// Activate license via license server API
async function activateLicenseFromAPI(
  licenseKey: string,
): Promise<{ success: boolean; license?: LicenseFromAPI; message?: string }> {
  try {
    const apiUrl = `${LICENSE_API_URL}/api/licenses/validate?action=activate`;
    console.log("[License] Activating via:", apiUrl);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ licenseKey }),
      cache: "no-store",
    });

    console.log("[License] Response status:", response.status);

    const data = await response.json();
    console.log("[License] Response data:", JSON.stringify(data).substring(0, 500));

    if (!response.ok || !data.success) {
      return {
        success: false,
        message: data.message || "Failed to activate license",
      };
    }

    return {
      success: true,
      license: data.data?.license || data.license,
    };
  } catch (error) {
    console.error("Error activating license from API:", error);
    return { success: false, message: "Failed to connect to license server" };
  }
}

// Deactivate license via license server API
async function deactivateLicenseFromAPI(licenseKey: string): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${LICENSE_API_URL}/api/licenses/validate?action=deactivate`;
    console.log("[License] Deactivating via:", apiUrl);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ licenseKey }),
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        message: data.message || "Failed to deactivate license",
      };
    }

    return { success: true };
  } catch (error) {
    console.error("Error deactivating license from API:", error);
    return { success: false, message: "Failed to connect to license server" };
  }
}

// GET - Check license status
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action !== "status") {
    return NextResponse.json(
      { success: false, message: "Invalid action. Use action=status for GET requests." },
      { status: 400 },
    );
  }

  try {
    const cookieStore = await cookies();
    const licenseData = cookieStore.get(LICENSE_COOKIE_NAME)?.value;

    if (!licenseData) {
      return NextResponse.json({
        success: false,
        message: "No active license found",
        license: { isValid: false },
      });
    }

    const license: StoredLicenseData = JSON.parse(licenseData);

    // Check if license is expired
    if (new Date(license.expiresAt) < new Date()) {
      return NextResponse.json({
        success: false,
        message: "License has expired",
        license: { ...license, isValid: false, status: "expired" },
      });
    }

    return NextResponse.json({
      success: true,
      message: "License is valid",
      license: { ...license, isValid: true },
    });
  } catch (error) {
    console.error("Error checking license status:", error);
    return NextResponse.json({ success: false, message: "Error checking license status" }, { status: 500 });
  }
}

// POST - Activate or Deactivate license
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  if (action === "activate") {
    try {
      const body = await request.json();
      const { licenseKey } = body;

      if (!licenseKey) {
        return NextResponse.json({ success: false, message: "License key is required" }, { status: 400 });
      }

      // Activate license via license server API
      const result = await activateLicenseFromAPI(licenseKey);

      if (!result.success || !result.license) {
        return NextResponse.json(
          {
            success: false,
            message: result.message || "Invalid license key, expired, or max activations reached.",
          },
          { status: 400 },
        );
      }

      const licenseFromAPI = result.license;

      // Store license data
      const storedLicense: StoredLicenseData = {
        id: licenseFromAPI.id,
        licenseKey: licenseFromAPI.licenseKey,
        productName: licenseFromAPI.productName,
        userEmail: licenseFromAPI.userEmail,
        userName: licenseFromAPI.userName,
        status: licenseFromAPI.status,
        type: licenseFromAPI.type,
        maxActivations: licenseFromAPI.maxActivations,
        currentActivations: licenseFromAPI.currentActivations,
        expiresAt: licenseFromAPI.expiresAt,
        activatedAt: new Date().toISOString(),
        isValid: true,
      };

      // Store license in cookie
      const response = NextResponse.json({
        success: true,
        message: "License activated successfully",
        license: storedLicense,
      });

      response.cookies.set(LICENSE_COOKIE_NAME, JSON.stringify(storedLicense), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        path: "/",
      });

      return response;
    } catch (error) {
      console.error("Error activating license:", error);
      return NextResponse.json({ success: false, message: "Error activating license" }, { status: 500 });
    }
  }

  if (action === "deactivate") {
    try {
      // Get current license from cookie to get the license key
      const cookieStore = await cookies();
      const licenseData = cookieStore.get(LICENSE_COOKIE_NAME)?.value;

      if (licenseData) {
        const license: StoredLicenseData = JSON.parse(licenseData);
        // Deactivate on license server
        await deactivateLicenseFromAPI(license.licenseKey);
      }

      const response = NextResponse.json({
        success: true,
        message: "License deactivated successfully",
      });

      response.cookies.delete(LICENSE_COOKIE_NAME);

      return response;
    } catch (error) {
      console.error("Error deactivating license:", error);
      return NextResponse.json({ success: false, message: "Error deactivating license" }, { status: 500 });
    }
  }

  return NextResponse.json(
    { success: false, message: "Invalid action. Use action=activate or action=deactivate" },
    { status: 400 },
  );
}
