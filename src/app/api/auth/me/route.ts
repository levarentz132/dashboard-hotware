// Me API Route
// GET /api/auth/me - Get full user profile from external API

import { NextRequest, NextResponse } from "next/server";
import { getExternalMe } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/auth/constants";

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        }

        const data = await getExternalMe(token);
        return NextResponse.json(data);
    } catch (error) {
        console.error("Me API error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
