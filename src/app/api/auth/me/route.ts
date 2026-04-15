// Me API Route
// GET /api/auth/me - Get full user profile from external API

import { NextRequest, NextResponse } from "next/server";
import { getExternalMe } from "@/lib/auth";
import { AUTH_CONFIG } from "@/lib/auth/constants";

export async function GET(request: NextRequest) {
    try {
        const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;

        if (!token) {
            return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
        }

        const data = await getExternalMe(token);

        // If external API reports expired license, trigger logout via 403
        if (data && data.user) {
            const licenseStatus = (data.user.license_status || "").toLowerCase();
            const daysRemaining = data.user.days_remaining;
            const isActuallyActive = data.user.is_active !== false && 
                                    licenseStatus !== "expired" && 
                                    (daysRemaining === undefined || daysRemaining === null || daysRemaining > 0);

            if (!isActuallyActive && licenseStatus !== 'active') {
                return NextResponse.json({ 
                    success: false, 
                    message: `Lisensi Anda telah habis. Status: ${data.user.license_status_display || "Expired"}`,
                    licenseExpired: true
                }, { status: 403 });
            }
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error("Me API error:", error);
        return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
}
