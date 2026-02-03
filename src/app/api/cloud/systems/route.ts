import { NextRequest, NextResponse } from "next/server";
import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(`${CLOUD_CONFIG.baseURL}/cdb/systems`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": getCloudAuthHeader()
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: `Cloud API error: ${response.status}`, details: errorText }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error("[API Cloud Systems] Error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
