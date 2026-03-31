import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { normalizeNxEvents } from "@/lib/nx-normalization";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Use v4 events log endpoint
  // Build query parameters
  const serverId = searchParams.get("serverId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("_limit") || searchParams.get("limit") || "100";

  try {
    // 1. Try v4 endpoint (v5.1+)
    const v4Params = new URLSearchParams();
    if (serverId) v4Params.set("serverId", serverId);
    if (from) v4Params.set("from", from);
    if (to) v4Params.set("to", to);
    v4Params.set("limit", limit);

    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v4/events/log",
      queryParams: v4Params,
    });

    if (response.ok) {
      const data = await response.json();
      const normalized = normalizeNxEvents(data);
      if (normalized.length > 0) return NextResponse.json(normalized);
    }

    // 2. Fallback to legacy /api/getEvents (v4.x, v5.0)
    console.log(`[Cloud Events] v4 failed or empty, trying legacy fallback for ${systemId}`);
    
    const legacyParams = new URLSearchParams();
    // Legacy API uses 'timestamp' (microseconds) for start time
    if (from) {
      const fromMs = parseInt(from);
      if (!isNaN(fromMs)) legacyParams.set("timestamp", (fromMs * 1000).toString());
    }
    if (serverId) legacyParams.set("serverId", serverId);
    legacyParams.set("limit", limit);

    const v3Response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/api/getEvents",
      queryParams: legacyParams,
    });

    if (v3Response.ok) {
      const v3Data = await v3Response.json();
      return NextResponse.json(normalizeNxEvents(v3Data));
    }

    return response;
  } catch (error) {
    console.error("[Cloud Events] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
