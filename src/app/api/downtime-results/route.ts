import { NextRequest, NextResponse } from "next/server";
import {
  saveDowntimeResult,
  getDowntimeResult,
  isValidDowntimeResult,
  type StoredDowntimeResult,
  type PeriodType,
} from "@/lib/downtime-result-store";
import { AUTH_CONFIG } from "@/lib/auth/constants";

function isAuthorized(request: NextRequest): boolean {
  const token =
    request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value ||
    request.cookies.get("local_nx_user")?.value ||
    request.cookies.get("nx_cloud_session")?.value;
  return Boolean(token && token.trim() !== "");
}

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const periodType = searchParams.get("periodType");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const selectedServerLabel = searchParams.get("selectedServerLabel");

    if (!periodType || !dateFrom || !dateTo || !selectedServerLabel) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required query parameters: periodType, dateFrom, dateTo, selectedServerLabel",
        },
        { status: 400 },
      );
    }

    const result = await getDowntimeResult(periodType, dateFrom, dateTo, selectedServerLabel);
    if (!result) {
      return NextResponse.json(
        { success: false, error: "Downtime result not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[Downtime Results API] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve downtime result" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as StoredDowntimeResult;

    if (!body.periodType || !body.dateFrom || !body.dateTo || !body.selectedServerLabel) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: periodType, dateFrom, dateTo, selectedServerLabel",
        },
        { status: 400 },
      );
    }

    const validPeriodTypes = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"];
    if (!validPeriodTypes.includes(body.periodType)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid periodType. Must be one of: ${validPeriodTypes.join(", ")}`,
        },
        { status: 400 },
      );
    }

    if (!body.metrics || typeof body.metrics.periodCameraUptimeRate !== "number") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid metrics object",
        },
        { status: 400 },
      );
    }

    const doc: StoredDowntimeResult = {
      version: body.version || 1,
      periodType: body.periodType as PeriodType,
      dateFrom: body.dateFrom,
      dateTo: body.dateTo,
      label: body.label || "",
      selectedServerLabel: body.selectedServerLabel,
      calculatedAt: body.calculatedAt || new Date().toISOString(),
      metrics: {
        periodCameraUptimeRate: body.metrics.periodCameraUptimeRate,
        metricDescription: body.metrics.metricDescription || "AVERAGE PER-CAMERA UPTIME INDEX",
        totalDowntimeMs: body.metrics.totalDowntimeMs || 0,
        totalDowntimeFormatted: body.metrics.totalDowntimeFormatted || "0s",
        totalOfflineIncidents: body.metrics.totalOfflineIncidents || 0,
        resolvedIncidents: body.metrics.resolvedIncidents || 0,
        activeIncidents: body.metrics.activeIncidents || 0,
      },
      cameras: body.cameras || [],
      ...(body.cameraInventory ? { cameraInventory: body.cameraInventory } : {}),
      ...(body.server ? { server: body.server } : {}),
      ...(body.alarms ? { alarms: body.alarms } : {}),
    };

    if (!isValidDowntimeResult(doc)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid downtime result semantic payload",
        },
        { status: 400 },
      );
    }

    await saveDowntimeResult(doc);

    return NextResponse.json({
      success: true,
      message: "Downtime result saved",
      calculatedAt: doc.calculatedAt,
    });
  } catch (error) {
    console.error("[Downtime Results API] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save downtime result" },
      { status: 500 },
    );
  }
}
