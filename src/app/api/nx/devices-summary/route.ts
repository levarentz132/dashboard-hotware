import { NextRequest, NextResponse } from "next/server";
import { validateSystemId } from "@/lib/cloud-api";
import { readDevicesSummary } from "@/lib/nx-devices-store";

/** Redis-only device summary (id, name, status) — no NX round-trip. */
export async function GET(request: NextRequest) {
  const { systemId } = validateSystemId(request);
  if (!systemId) {
    return NextResponse.json({ error: "systemId is required" }, { status: 400 });
  }

  const summary = await readDevicesSummary(systemId);
  if (!summary?.length) {
    return NextResponse.json(
      { devices: [], source: "redis-miss" },
      { headers: { "X-NX-Cache": "MISS" } },
    );
  }

  return NextResponse.json(
    { devices: summary, source: "redis" },
    { headers: { "X-NX-Cache": "HIT" } },
  );
}
