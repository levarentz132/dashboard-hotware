import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
    // Use the standardized cloud API fetcher
    // systemId 'all' triggers global cloud logic in buildCloudUrl and buildCloudHeaders
    return fetchFromCloudApi(request, {
        systemId: 'all',
        endpoint: '/api/systems/',
        systemName: 'NX Cloud'
    });
}
