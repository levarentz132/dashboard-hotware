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

// Validate license key against the license API
async function validateLicenseKeyFromAPI(licenseKey: string): Promise<LicenseFromAPI | null> {
  try {
    // Fetch all licenses from the API
    const response = await fetch(`${LICENSE_API_URL}/api/licenses`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch licenses from API:", response.status);
      return null;
    }

    const data = await response.json();
    const licenses: LicenseFromAPI[] = data.data?.licenses || [];

    // Find the license with matching key
    const license = licenses.find((lic) => lic.licenseKey.toUpperCase() === licenseKey.toUpperCase());

    if (!license) {
      return null;
    }

    // Check if license is active and not expired
    if (license.status !== "active") {
      return null;
    }

    if (new Date(license.expiresAt) < new Date()) {
      return null;
    }

    // Check if max activations reached
    if (license.currentActivations >= license.maxActivations) {
      return null;
    }

    return license;
  } catch (error) {
    console.error("Error validating license from API:", error);
    return null;
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

      // Validate the license key against the API
      const licenseFromAPI = await validateLicenseKeyFromAPI(licenseKey);

      if (!licenseFromAPI) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid license key, expired, or max activations reached.",
          },
          { status: 400 },
        );
      }

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
        currentActivations: licenseFromAPI.currentActivations + 1,
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
