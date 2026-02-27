import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { systemId, systemName } = validateSystemId(request);
  const serverId = searchParams.get("serverId");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Use v4 events log endpoint
  const endpoint = "/rest/v4/events/log";

  // Build query parameters for events
  const queryParams = new URLSearchParams();
  const serverIdParam = searchParams.get("serverId");
  if (serverIdParam) queryParams.set("serverId", serverIdParam);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("_limit") || "50";

  if (from) queryParams.set("from", from);
  if (to) queryParams.set("to", to);
  queryParams.set("limit", limit);

  return fetchFromCloudApi(request, {
    systemId,
    systemName: systemName || undefined,
    endpoint,
    queryParams,
  });
}
