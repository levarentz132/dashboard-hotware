import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi } from "@/lib/cloud-api";
import { getNxSystems } from "@/lib/nx-cloud-service";

export async function GET(request: NextRequest) {
  // Extract accessToken from cookie or header
  let accessToken: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    accessToken = authHeader.substring(7).trim();
  }

  if (!accessToken) {
    try {
      const cookieHeader = request.headers.get("cookie") || "";
      const match = cookieHeader.match(/(?:^|;\s*)nx_cloud_session=([^;]+)/);
      if (match) {
        const session = JSON.parse(decodeURIComponent(match[1]));
        accessToken = session?.accessToken || null;
      }
    } catch (_) {}
  }

  if (accessToken) {
    try {
      const systems = await getNxSystems(accessToken);
      return NextResponse.json(systems);
    } catch (err: any) {
      console.warn("[Cloud Systems Proxy] Direct getNxSystems failed, falling back:", err.message);
    }
  }

  // Fallback to proxy
  return fetchFromCloudApi(request, {
    systemId: "all",
    endpoint: "/api/systems/",
    systemName: "NX Cloud",
  });
}
