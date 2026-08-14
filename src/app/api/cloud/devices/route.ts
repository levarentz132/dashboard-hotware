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
    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/rest/v3/devices",
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(normalizeNxDevices(data));
  } catch (error) {
    console.error("[Cloud Devices] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
