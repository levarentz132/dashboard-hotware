import { NextRequest, NextResponse } from "next/server";
import { readRecordingLogs } from "@/lib/recording-logger";
import {
  appendScheduledErrorLog,
  dismissAllScheduledErrorLogsForCamera,
  dismissScheduledErrorLog,
  getAllScheduledErrorLogs,
  getCamerasWithScheduledErrorLogs,
  getScheduledErrorLogsForCamera,
} from "@/lib/scheduled-error-logs-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cameraId = searchParams.get("cameraId");
    const cameraName = searchParams.get("cameraName");
    const syncAudit = searchParams.get("syncAudit") === "true";
    const all = searchParams.get("all") === "true";

    if (all) {
      const entries = await getAllScheduledErrorLogs();
      return NextResponse.json({ entries, total: entries.length });
    }

    if (cameraId) {
      if (syncAudit && cameraName) {
        const auditLogs = readRecordingLogs({
          cameraName,
          limit: 100,
          errorsOnly: true,
        });
        for (const log of auditLogs) {
          await appendScheduledErrorLog({
            cameraId,
            cameraName,
            message: log.message,
            timestamp: log.timestamp,
          });
        }
      }

      const entries = await getScheduledErrorLogsForCamera(cameraId);
      return NextResponse.json({ entries, total: entries.length });
    }

    const cameras = await getCamerasWithScheduledErrorLogs();
    return NextResponse.json({ cameras });
  } catch (e: any) {
    return NextResponse.json({ entries: [], error: e.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const entry = await appendScheduledErrorLog({
      cameraId: body.cameraId,
      cameraName: body.cameraName,
      systemId: body.systemId,
      message: body.message,
      timestamp: body.timestamp,
    });
    return NextResponse.json({ entry });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cameraId = searchParams.get("cameraId");
    const entryId = searchParams.get("entryId");

    if (entryId) {
      const ok = await dismissScheduledErrorLog(entryId);
      return NextResponse.json({ success: ok });
    }

    if (cameraId) {
      const removed = await dismissAllScheduledErrorLogsForCamera(cameraId);
      return NextResponse.json({ success: true, removed });
    }

    return NextResponse.json({ error: "cameraId or entryId required" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
