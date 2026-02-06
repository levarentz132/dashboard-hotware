// User Listing API Route
// GET /api/users - List all users for an organization on the external API

import { NextRequest, NextResponse } from "next/server";
import { callExternalGetUsers, callExternalDeleteUser, verifyToken } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/auth/constants";

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header or cookie
    let token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    }

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Verify token
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
    }

    // Call external API - token is enough to identify organization
    const result = await callExternalGetUsers(token);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error("Users API error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
