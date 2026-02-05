// Sub-Account API Routes
// GET - List all sub-accounts
// POST - Create new sub-account

import { NextRequest, NextResponse } from "next/server";
import { validateSession } from "@/lib/auth";
import { cookies } from "next/headers";
import { AUTH_CONFIG } from "@/lib/auth/constants";

const EXTERNAL_API_URL = process.env.EXTERNAL_AUTH_API_URL?.replace("/api.php", "") || "";

// Get auth token from cookies for API calls
async function getAuthToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_CONFIG.COOKIE_NAME)?.value || null;
}

// GET /api/subaccounts - List all sub-accounts for current user
export async function GET(request: NextRequest) {
  try {
    const token = await getAuthToken();

    // Validate session
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session.valid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Call external API to get sub-accounts
    const response = await fetch(`${EXTERNAL_API_URL}/subaccounts.php`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error fetching sub-accounts:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch sub-accounts" }, { status: 500 });
  }
}

// POST /api/subaccounts - Create new sub-account
export async function POST(request: NextRequest) {
  try {
    const token = await getAuthToken();

    // Validate session
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session.valid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Call external API to create sub-account
    const response = await fetch(`${EXTERNAL_API_URL}/subaccounts.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error creating sub-account:", error);
    return NextResponse.json({ success: false, message: "Failed to create sub-account" }, { status: 500 });
  }
}
