import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { normalizeNxDevices } from "@/lib/nx-normalization";
import { AUTH_CONFIG } from "@/lib/auth/constants";
import { getExternalMe } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  try {
    // 1. Try v4 endpoint first
    let response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/devices",
    });

    if (response.ok) {
      const data = await response.json();
      const normalized = normalizeNxDevices(data);

      // If external auth provides org_camera_ids for the user, filter devices
      try {
        const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
        if (token) {
          const me = await getExternalMe(token).catch(() => null);
          const allowed = me?.user?.org_camera_ids ?? me?.user?.orgCameraIds ?? undefined;
          if (Array.isArray(allowed) && allowed.length > 0) {
            const allowedSet = new Set(allowed.map((id: any) => String(id).toLowerCase()));
            const filtered = normalized.filter((d: any) => allowedSet.has(String(d.id).toLowerCase()));
            if (filtered.length > 0) return NextResponse.json(filtered);
            // If filtering results in empty, fall back to original normalized list
          }
        }
      } catch (e) {
        console.warn("[Cloud Devices] Failed to apply org_camera_ids filter:", e);
      }

      if (normalized.length > 0) {
        return NextResponse.json(normalized);
      }
    }

    // 2. Fallback to v3 if v4 fails or is empty
    console.log(`[Cloud Devices] v4 failed or empty, trying v3 fallback for ${systemId}`);
    const v3Response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/devices",
    });

    if (v3Response.ok) {
      const v3Data = await v3Response.json();
      return NextResponse.json(normalizeNxDevices(v3Data));
    }

    return response;
  } catch (error) {
    console.error("[Cloud Devices] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
