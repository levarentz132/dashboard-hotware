import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";
import { normalizeNxEvents } from "@/lib/nx-normalization";
import { getNxSystemToken, getNxEvents } from "@/lib/nx-cloud-service";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const { systemId, systemName } = validateSystemId(request);

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  // Extract refreshToken from session cookies
  let refreshToken: string | null = null;
  try {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(/(?:^|;\s*)nx_cloud_session=([^;]+)/);
    if (match) {
      const session = JSON.parse(decodeURIComponent(match[1]));
      refreshToken = session?.refreshToken || null;
    }
  } catch (_) {}

  const serverId = searchParams.get("serverId");
  const from = searchParams.get("from") || searchParams.get("timestamp");
  const limitStr = searchParams.get("_limit") || searchParams.get("limit") || "2000";
  const limit = parseInt(limitStr, 10) || 2000;
  const fromMs = from ? parseInt(from, 10) : undefined;

  // 1. Primary Flow: Use System-Scoped Token via nx-cloud-service for Cloud systems
  if (refreshToken && systemId && systemId !== "all" && systemId !== "localhost") {
    try {
      console.log(`[Cloud Events Proxy] Generating system-scoped token for systemId=${systemId}`);
      const systemAccessToken = await getNxSystemToken(refreshToken, systemId);
      const eventsData = await getNxEvents(systemId, systemAccessToken, {
        fromMs: !isNaN(fromMs as number) ? fromMs : undefined,
        limit,
      });
      return NextResponse.json(normalizeNxEvents(eventsData));
    } catch (err: any) {
      console.warn(`[Cloud Events Proxy] Scoped token flow failed for system ${systemId}, falling back:`, err.message);
    }
  }

  // 2. Fallback Flow: Standard cloud API fetcher
  try {
    const legacyParams = new URLSearchParams();
    if (fromMs && !isNaN(fromMs)) {
      legacyParams.set("timestamp", (fromMs * 1000).toString());
    }
    if (serverId) legacyParams.set("serverId", serverId);
    legacyParams.set("limit", limitStr);

    const response = await fetchFromCloudApi(request, {
      systemId,
      systemName: systemName || undefined,
      endpoint: "/api/getEvents",
      queryParams: legacyParams,
    });

    if (response.ok) {
      const data = await response.json();
      return NextResponse.json(normalizeNxEvents(data));
    }

    return response;
  } catch (error) {
    console.error("[Cloud Events Proxy] Fetch error:", error);
    return NextResponse.json({ error: "Cloud fetch failed" }, { status: 500 });
  }
}
