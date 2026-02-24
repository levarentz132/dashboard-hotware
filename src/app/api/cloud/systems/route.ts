import { NextRequest, NextResponse } from "next/server";
import { CLOUD_CONFIG, getCloudAuthHeader } from "@/lib/config";

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(`${CLOUD_CONFIG.baseURL}/api/systems/`, {
            method: "GET",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": getCloudAuthHeader(request)
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json({ error: `Cloud API error: ${response.status}`, details: errorText }, { status: response.status });
        }

        const data = await response.json();
        // If it's an array, wrap it in systems key for compatibility with use-async-data.ts
        const result = Array.isArray(data) ? { systems: data } : data;
        return NextResponse.json(result);
    } catch (error: any) {
        console.error("[API Cloud Systems] Error:", error);
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
