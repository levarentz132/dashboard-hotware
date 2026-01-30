import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Use the standard Nx REST v3 storages endpoint through cloud relay
  return fetchFromCloudApi(request, {
    systemId,
    systemName: systemName || undefined,
    endpoint: "/rest/v3/servers/this/storages",
  });
}

