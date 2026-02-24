import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { systemId, systemName } = validateSystemId(request);
  const serverId = searchParams.get("serverId");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Determine endpoint: system-wide or server-specific
  const endpoint = serverId
    ? `/rest/v3/servers/${serverId}/events`
    : `/rest/v3/events`;

  // Build query parameters for events
  const queryParams = new URLSearchParams();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = searchParams.get("_limit");
  const order = searchParams.get("_order");
  const with_ = searchParams.get("_with");

  if (from) queryParams.set("from", from);
  if (to) queryParams.set("to", to);
  if (limit) queryParams.set("_limit", limit);
  if (order) queryParams.set("_order", order);
  if (with_) queryParams.set("_with", with_);

  return fetchFromCloudApi(request, {
    systemId,
    systemName: systemName || undefined,
    endpoint: `/rest/v3/servers/${serverId}/events`,
    queryParams,
  });
}
