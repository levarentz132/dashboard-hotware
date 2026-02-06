// User Management API Routes - Individual operations
// GET /api/users/[id] - Get single user
// PUT /api/users/[id] - Update user
// DELETE /api/users/[id] - Delete user

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, callExternalGetUserDetail } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/auth/constants";

// GET /api/users/[id] - Get single user detail + permissions
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Get token from Authorization header or cookie
    let token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    }

    // Validate session
    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
    }

    // Call external API
    const result = await callExternalGetUserDetail(token, id);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("Error fetching user:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch user" }, { status: 500 });
  }
}
