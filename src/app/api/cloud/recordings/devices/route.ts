import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId, buildCloudUrl, buildCloudHeaders } from "@/lib/cloud-api";
import { normalizeNxDevices } from "@/lib/nx-normalization";

export async function GET(request: NextRequest) {
  try {
    const { systemId, systemName } = validateSystemId(request);

    if (!systemId) {
      return NextResponse.json(
        { error: "systemId is required" },
        { status: 400 }
      );
    }

    console.log(`[recordings/devices] Fetching devices for system: ${systemId}`);
    
    // Log auth headers being used
    const headers = buildCloudHeaders(request, systemId);
    console.log(`[recordings/devices] Auth headers present:`, {
      hasAuthorization: !!headers["Authorization"],
      hasRuntimeGuid: !!headers["x-runtime-guid"],
      systemId
    });

    // Use the standard cloud API pattern that handles auth via cookies/tokens
    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/devices",
    });

    console.log(`[recordings/devices] Response status: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[recordings/devices] Error response:", response.status, errorData);
      return NextResponse.json(
        { error: errorData.error || `Failed to fetch devices: ${response.status}` },
        { status: response.status }
      );
    }

    const devices = await response.json();
    console.log(`[recordings/devices] Raw devices count: ${Array.isArray(devices) ? devices.length : 'not array'}`);
    
    const normalized = normalizeNxDevices(devices);
    console.log(`[recordings/devices] Normalized devices count: ${normalized.length}`);
    
    // Filter to cameras - identify by properties since typeId might be a GUID
    // Cameras have streamUrls, vendor like camera brands, or physicalId (MAC address)
    const cameras = normalized.filter((d: any) => {
      const typeId = (d.typeId || '').toLowerCase();
      const type = (d.type || '').toLowerCase();
      
      // Direct type checks
      if (typeId.includes('camera') || type.includes('camera')) return true;
      if (typeId === 'nx.camera' || typeId === 'nx.ipcamera') return true;
      
      // Check if device has camera-like properties
      const hasStreamUrls = d.streamUrls && Object.keys(d.streamUrls).length > 0;
      const hasRtspUrl = d.url && (d.url.includes('rtsp://') || (typeof d.streamUrls === 'object'));
      const hasPhysicalId = !!d.physicalId; // MAC address indicates physical device
      const hasMotionStream = !!d.parameters?.motionStream;
      
      // If it has stream URLs or physical ID, it's likely a camera
      return hasStreamUrls || hasPhysicalId || hasMotionStream;
    });

    console.log(`[recordings/devices] Cameras after filter: ${cameras.length}`);

    return NextResponse.json(cameras);
  } catch (error) {
    console.error("[recordings/devices] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 }
    );
  }
}
