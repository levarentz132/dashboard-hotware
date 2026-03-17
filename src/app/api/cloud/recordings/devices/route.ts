import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId, buildCloudUrl, buildCloudHeaders } from "@/lib/cloud-api";
import { normalizeNxDevices } from "@/lib/nx-normalization";
import { AUTH_CONFIG } from "@/lib/auth/constants";
import { getExternalMe } from "@/lib/auth";

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
    // Debug: log raw response (truncated) and sample IDs for matching
    try {
      const asString = JSON.stringify(devices);
      console.log(`[recordings/devices] Raw response (truncated): ${asString.slice(0, 2000)}`);
    } catch (e) {
      console.log('[recordings/devices] Raw response present but failed to stringify');
    }
    console.log(`[recordings/devices] Raw devices count: ${Array.isArray(devices) ? devices.length : 'not array'}`);
    try {
      const sample = (Array.isArray(devices) ? devices : devices?.devices || []).slice(0, 10).map((d: any) => ({ id: d.id, name: d.name, physicalId: d.physicalId }));
      console.log('[recordings/devices] Sample device items:', sample);
    } catch (e) {
      console.log('[recordings/devices] Failed to extract sample device items');
    }
    
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

    // Apply org_camera_ids filter if provided by external auth
    try {
      const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
      if (token) {
        const me = await getExternalMe(token).catch(() => null);
        const allowed = me?.user?.org_camera_ids ?? me?.user?.orgCameraIds ?? undefined;
        if (Array.isArray(allowed) && allowed.length > 0) {
          const allowedSet = new Set(allowed.map((id: any) => String(id).toLowerCase()));
          const filtered = cameras.filter((d: any) => allowedSet.has(String(d.id).toLowerCase()));
          console.log(`[recordings/devices] Cameras after org_camera_ids filter: ${filtered.length}`);
          return NextResponse.json(filtered);
        }
      }
    } catch (e) {
      console.warn("[recordings/devices] Failed to apply org_camera_ids filter:", e);
    }

    return NextResponse.json(cameras);
  } catch (error) {
    console.error("[recordings/devices] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 }
    );
  }
}
