import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { normalizeNxServers } from "@/lib/nx-normalization";

export async function GET(request: NextRequest) {
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  try {
    // 1. Try v4 endpoint first
    let response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/servers",
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(normalizeNxServers(data));
    }

    // 2. Fallback to v3 if v4 fails (likely 404 or 405 on older versions)
    console.log(`[Cloud Servers] v4 failed (${response.status}), trying v3 fallback for ${systemId}`);
    const v3Response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/servers",
    });

    if (v3Response.ok) {
      const v3Data = await v3Response.json();
      return NextResponse.json(normalizeNxServers(v3Data));
    }

    return response;
  } catch (error) {
    console.error("[Cloud Servers] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
