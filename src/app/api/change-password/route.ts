
import { NextRequest, NextResponse } from "next/server";
import { callExternalChangePassword, verifyToken } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/auth/constants";

export async function POST(request: NextRequest) {
    try {
        // Get token from Authorization header or cookie
        let token = request.headers.get("Authorization")?.replace("Bearer ", "");
        if (!token) {
            token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
        }

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        // Verify token and check for admin role
        const payload = await verifyToken(token);
        if (!payload) {
            return NextResponse.json({ success: false, message: "Invalid session" }, { status: 401 });
        }

        if (payload.role !== "admin") {
            return NextResponse.json({ success: false, message: "Only administrators can change passwords" }, { status: 403 });
        }

        const body = await request.json();
        const { user_id, new_password } = body;

        if (!user_id || !new_password) {
            return NextResponse.json({ success: false, message: "User ID and new password are required" }, { status: 400 });
        }

        // Call external API
        const result = await callExternalChangePassword(token, user_id, new_password);

        // Some APIs might return result directly or wrapped.
        // If external-api already normalizes it to { success, message }, just return it.
        return NextResponse.json(result, { status: result.success ? 200 : 400 });

    } catch (error) {
        console.error("Change Password API error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
