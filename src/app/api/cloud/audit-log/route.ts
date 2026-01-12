import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  const { systemId } = validateSystemId(request);
  const from = request.nextUrl.searchParams.get("from");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  if (!from) {
    return NextResponse.json({ error: "From date is required (format: YYYY-MM-DDTHH:mm:ss.zzz)" }, { status: 400 });
  }

  const queryParams = new URLSearchParams();
  queryParams.set("from", from);

  return fetchFromCloudApi(request, {
    systemId,
    endpoint: "/api/auditLog",
    queryParams,
  });
}
