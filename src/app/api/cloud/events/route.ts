import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { normalizeNxEvents } from "@/lib/nx-normalization";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Build query parameters
  const serverId = searchParams.get("serverId");
  const from = searchParams.get("from");
  const limit = searchParams.get("_limit") || searchParams.get("limit") || "100";

  try {
    const legacyParams = new URLSearchParams();
    // Legacy API uses 'timestamp' (microseconds) for start time
    if (from) {
      const fromMs = parseInt(from);
      if (!isNaN(fromMs)) legacyParams.set("timestamp", (fromMs * 1000).toString());
    }
    if (serverId) legacyParams.set("serverId", serverId);
    legacyParams.set("limit", limit);

    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/api/getEvents",
      queryParams: legacyParams,
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(normalizeNxEvents(data));
    }

    return response;
  } catch (error) {
    console.error("[Cloud Events] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
