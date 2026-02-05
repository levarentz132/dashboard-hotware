// Sub-Account API Routes - Individual operations
// GET /api/subaccounts/[id] - Get single sub-account
// PUT /api/subaccounts/[id] - Update sub-account
// DELETE /api/subaccounts/[id] - Delete sub-account

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

// GET /api/subaccounts/[id] - Get single sub-account
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();

    // Validate session
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session.valid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Call external API
    const response = await fetch(`${EXTERNAL_API_URL}/subaccounts.php?id=${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error fetching sub-account:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch sub-account" }, { status: 500 });
  }
}

// PUT /api/subaccounts/[id] - Update sub-account
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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

    // Call external API
    const response = await fetch(`${EXTERNAL_API_URL}/subaccounts.php?id=${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error updating sub-account:", error);
    return NextResponse.json({ success: false, message: "Failed to update sub-account" }, { status: 500 });
  }
}

// DELETE /api/subaccounts/[id] - Delete sub-account
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = await getAuthToken();

    // Validate session
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const session = await validateSession(token);
    if (!session.valid) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Call external API
    const response = await fetch(`${EXTERNAL_API_URL}/subaccounts.php?id=${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error deleting sub-account:", error);
    return NextResponse.json({ success: false, message: "Failed to delete sub-account" }, { status: 500 });
  }
}
