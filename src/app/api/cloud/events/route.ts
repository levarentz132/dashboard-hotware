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
  const endpoint = "/rest/v3/events/log";

  // Build query parameters for events
  const queryParams = new URLSearchParams();
  const serverIdParam = searchParams.get("serverId");
  if (serverIdParam) queryParams.set("serverId", serverIdParam);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("_limit") || "100";

  if (from) queryParams.set("from", from);
  if (to) queryParams.set("to", to);
  queryParams.set("limit", limit);

  try {
    // 1. Try v4 endpoint first
    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint,
      queryParams,
    });

    if (response.ok) {
      const data = await response.json();
      const normalized = normalizeNxEvents(data);
      if (normalized.length > 0) {
        return NextResponse.json(normalized);
      }
    }

    // 2. Fallback to v3 /api/getEvents if v4 not found (404) or failed or empty
    console.log(`[Cloud Events] v4 failed or empty, trying v3 fallback for ${systemId}`);

    const v3Response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/api/getEvents",
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
