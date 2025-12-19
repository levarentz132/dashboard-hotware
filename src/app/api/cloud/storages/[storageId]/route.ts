import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// GET - Fetch single storage
export async function GET(request: NextRequest, { params }: { params: Promise<{ storageId: string }> }) {
  const { storageId } = await params;
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
    const response = await fetch(
      `https://${systemId}.relay.vmsproxy.com/rest/v3/servers/${serverId}/storages/${storageId}`,
      { method: "GET", headers }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: "Failed to fetch storage", details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching storage:", error);
    return NextResponse.json({ error: "Failed to fetch storage" }, { status: 500 });
  }
}

// PUT - Update/Replace storage
export async function PUT(request: NextRequest, { params }: { params: Promise<{ storageId: string }> }) {
  const { storageId } = await params;
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

    const response = await fetch(
      `https://${systemId}.relay.vmsproxy.com/rest/v3/servers/${serverId}/storages/${storageId}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Update storage error:", errorText);
      return NextResponse.json({ error: "Failed to update storage", details: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating storage:", error);
    return NextResponse.json({ error: "Failed to update storage" }, { status: 500 });
  }
}

// DELETE - Delete storage
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ storageId: string }> }) {
  const { storageId } = await params;
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
    const response = await fetch(
      `https://${systemId}.relay.vmsproxy.com/rest/v3/servers/${serverId}/storages/${storageId}`,
      { method: "DELETE", headers }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Delete storage error:", errorText);
      return NextResponse.json({ error: "Failed to delete storage", details: errorText }, { status: response.status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting storage:", error);
    return NextResponse.json({ error: "Failed to delete storage" }, { status: 500 });
  }
}
