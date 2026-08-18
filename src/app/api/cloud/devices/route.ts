import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { getNxSystemToken, getNxDevices } from "@/lib/nx-cloud-service";

export async function GET(request: NextRequest) {
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Extract refreshToken from nx_cloud_session cookie or authorization header
  let refreshToken: string | null = null;
  let accessToken: string | null = null;

  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/(?:^|;\s*)nx_cloud_session=([^;]+)/);
    if (match) {
      const session = JSON.parse(decodeURIComponent(match[1]));
      refreshToken = session?.refreshToken || null;
      accessToken = session?.accessToken || null;
    }
  } catch (_) {}

  // 1. Primary Flow: Use System-Scoped Access Token via nx-cloud-service
  if (refreshToken && systemId && systemId !== "all" && systemId !== "localhost") {
    try {
      console.log(`[Cloud Devices Proxy] Generating system-scoped token for systemId=${systemId}`);
      const systemAccessToken = await getNxSystemToken(refreshToken, systemId);
      
      const devices = await getNxDevices(systemId, systemAccessToken);
      return NextResponse.json(devices);
    } catch (err: any) {
      console.warn(`[Cloud Devices Proxy] Scoped token flow failed for system ${systemId}, falling back:`, err.message);
    }
  }

  // 2. Fallback Flow: Standard cloud API proxy
  try {
    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v4/devices",
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    // Normalize if array
    if (Array.isArray(data)) {
      const normalized = data.map((d: any) => ({
        id: d.id || d.guid || "",
        name: d.name || d.userDefinedName || "Camera",
        status: d.status || d.state || "Offline",
        serverId: d.serverId || d.serverIdGuid || "",
        vendor: d.vendor || d.manufacturer || "Generic",
        model: d.model || "IP Camera",
        deviceType: d.deviceType || d.type || "Camera",
      }));
      return NextResponse.json(normalized);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("[Cloud Devices Proxy] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
