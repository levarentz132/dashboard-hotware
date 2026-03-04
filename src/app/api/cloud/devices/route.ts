import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { normalizeNxDevices } from "@/lib/nx-normalization";

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
      endpoint: "/rest/v4/devices",
    });

    if (response.ok) {
      const data = await response.json();
      const normalized = normalizeNxDevices(data);
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
