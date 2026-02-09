import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, postToCloudApi, validateSystemId } from "@/lib/cloud-api";

// GET - Fetch storages from cloud system with status information
export async function GET(request: NextRequest) {
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  try {
    // Fetch storage list from v3 endpoint
    const storagesResponse = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/servers/this/storages",
    });

    const storagesData = await storagesResponse.json();

    if (!storagesResponse.ok) {
      return NextResponse.json(storagesData, { status: storagesResponse.status });
    }

    // Fetch storage status from v4 endpoint
    const statusResponse = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v4/servers/this/storages/*/status",
    });

    const statusData = await statusResponse.json();

    // Merge status information with storage data
    if (Array.isArray(storagesData) && Array.isArray(statusData)) {
      const storagesWithStatus = storagesData.map((storage: any) => {
        // Remove curly braces from IDs for comparison
        const storageIdClean = storage.id.replace(/[{}]/g, '');
        const status = statusData.find((s: any) => {
          const statusIdClean = s.storageId.replace(/[{}]/g, '');
          return statusIdClean === storageIdClean;
        });
        return {
          ...storage,
          statusInfo: status || null,
        };
      });
      return NextResponse.json(storagesWithStatus);
    }

    return NextResponse.json(storagesData);
  } catch (error) {
    console.error("Error fetching storages:", error);
    return NextResponse.json({ error: "Failed to fetch storages" }, { status: 500 });
  }
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

