import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, postToCloudApi, validateSystemId } from "@/lib/cloud-api";

// GET - Fetch storages from cloud system
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

// POST - Create new storage
export async function POST(request: NextRequest) {
  const { systemId, systemName } = validateSystemId(request);
  const serverId = request.nextUrl.searchParams.get("serverId");

  if (!systemId || !serverId) {
    return NextResponse.json({ error: "systemId and serverId are required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    return postToCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: `/rest/v3/servers/${serverId}/storages`,
      body,
    });
  } catch (error) {
    console.error("Error creating storage:", error);
    return NextResponse.json({ error: "Failed to create storage" }, { status: 500 });
  }
}

