import { NextRequest, NextResponse } from "next/server";
import { validateSystemId } from "@/lib/cloud-api";
import { getDeviceFromCache } from "@/lib/nx-devices-store";

/**
 * Returns a single device from the Redis full-list cache (no NX GET /devices/{id}).
 * Client should fall back to nxAPI.getCameraById on 404.
 */
export async function GET(request: NextRequest) {
  const { systemId } = validateSystemId(request);
  const deviceId = request.nextUrl.searchParams.get("deviceId");

  if (!systemId || !deviceId) {
    return NextResponse.json(
      { error: "systemId and deviceId are required" },
      { status: 400 },
    );
  }

  const device = await getDeviceFromCache(systemId, deviceId);
  if (!device) {
    return NextResponse.json(
      { error: "Device not in cache" },
      { status: 404, headers: { "X-NX-Cache": "MISS" } },
    );
  }

  return NextResponse.json(device, { headers: { "X-NX-Cache": "HIT" } });
}
