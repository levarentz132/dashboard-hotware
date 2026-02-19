import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, validateSystemId } from "@/lib/cloud-api";

export async function GET(request: NextRequest) {
  const { systemId } = validateSystemId(request);
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const limit = request.nextUrl.searchParams.get("limit");

  if (!systemId) {
    return NextResponse.json({ error: "System ID is required" }, { status: 400 });
  }

  const queryParams = new URLSearchParams();

  // Default to 30 days ago if 'from' is not provided
  if (from) {
    queryParams.set("from", from);
  } else {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    queryParams.set("from", thirtyDaysAgo.toISOString());
  }

  if (to) {
    queryParams.set("to", to);
  }

  if (limit) {
    queryParams.set("limit", limit);
  }

  return fetchFromCloudApi(request, {
    systemId,
    endpoint: "/api/auditLog",
    queryParams,
  });
}
