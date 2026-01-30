import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, putToCloudApi, deleteFromCloudApi, validateSystemId } from "@/lib/cloud-api";

// GET - Fetch single storage
export async function GET(request: NextRequest, { params }: { params: Promise<{ storageId: string }> }) {
  const { storageId } = await params;
  const { systemId, systemName } = validateSystemId(request);
  const serverId = request.nextUrl.searchParams.get("serverId");

  if (!systemId || !serverId) {
    return NextResponse.json({ error: "systemId and serverId are required" }, { status: 400 });
  }

  return fetchFromCloudApi(request, {
    systemId,
    systemName: systemName || undefined,
    endpoint: `/rest/v3/servers/${serverId}/storages/${storageId}`,
  });
}

// PUT - Update/Replace storage
export async function PUT(request: NextRequest, { params }: { params: Promise<{ storageId: string }> }) {
  const { storageId } = await params;
  const { systemId, systemName } = validateSystemId(request);
  const serverId = request.nextUrl.searchParams.get("serverId");

  if (!systemId || !serverId) {
    return NextResponse.json({ error: "systemId and serverId are required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    return putToCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: `/rest/v3/servers/${serverId}/storages/${storageId}`,
      body,
    });
  } catch (error) {
    console.error("Error updating storage:", error);
    return NextResponse.json({ error: "Failed to update storage" }, { status: 500 });
  }
}

// DELETE - Delete storage
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ storageId: string }> }) {
  const { storageId } = await params;
  const { systemId, systemName } = validateSystemId(request);
  const serverId = request.nextUrl.searchParams.get("serverId");

  if (!systemId || !serverId) {
    return NextResponse.json({ error: "systemId and serverId are required" }, { status: 400 });
  }

  return deleteFromCloudApi(request, {
    systemId,
    systemName: systemName || undefined,
    endpoint: `/rest/v3/servers/${serverId}/storages/${storageId}`,
  });
}

