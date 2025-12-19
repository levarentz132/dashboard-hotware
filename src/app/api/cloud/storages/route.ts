import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// GET - Fetch storages and their status from cloud system
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const systemId = searchParams.get("systemId");

  if (!systemId) {
    return NextResponse.json({ error: "systemId is required" }, { status: 400 });
  }

  // Get auth token from cookie
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(`nx-cloud-${systemId}`);

  if (!tokenCookie?.value) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${tokenCookie.value}`,
  };

  try {
    // Fetch both storages and their status in parallel
    const [storagesResponse, statusResponse] = await Promise.all([
      fetch(`https://${systemId}.relay.vmsproxy.com/rest/v3/servers/this/storages`, {
        method: "GET",
        headers,
      }),
      fetch(`https://${systemId}.relay.vmsproxy.com/rest/v3/servers/this/storages/*/status`, {
        method: "GET",
        headers,
      }),
    ]);

    if (!storagesResponse.ok) {
      const errorText = await storagesResponse.text();
      console.error("Storages fetch error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch storages", details: errorText },
        { status: storagesResponse.status }
      );
    }

    const storages = await storagesResponse.json();

    // Status might fail if no storages exist, handle gracefully
    let statuses: Record<string, unknown>[] = [];
    if (statusResponse.ok) {
      statuses = await statusResponse.json();
    }

    // Merge storage info with status
    const mergedData = storages.map((storage: Record<string, unknown>) => {
      const status = statuses.find((s: Record<string, unknown>) => s.storageId === storage.id);
      return {
        ...storage,
        statusInfo: status || null,
      };
    });

    return NextResponse.json(mergedData);
  } catch (error) {
    console.error("Error fetching storages:", error);
    return NextResponse.json({ error: "Failed to fetch storages" }, { status: 500 });
  }
}

// POST - Create new storage
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const systemId = searchParams.get("systemId");
  const serverId = searchParams.get("serverId");

  if (!systemId || !serverId) {
    return NextResponse.json({ error: "systemId and serverId are required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(`nx-cloud-${systemId}`);

  if (!tokenCookie?.value) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const headers: HeadersInit = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${tokenCookie.value}`,
  };

  try {
    const body = await request.json();

    const response = await fetch(`https://${systemId}.relay.vmsproxy.com/rest/v3/servers/${serverId}/storages`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Create storage error:", errorText);
      return NextResponse.json({ error: "Failed to create storage", details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating storage:", error);
    return NextResponse.json({ error: "Failed to create storage" }, { status: 500 });
  }
}
