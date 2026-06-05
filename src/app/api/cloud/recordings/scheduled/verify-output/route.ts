import { NextRequest, NextResponse } from "next/server";
import {
  doesScreenshotFileExist,
  doesVideoFileExist,
} from "@/lib/schedule-output-files";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rec = body?.rec ?? body;
    const timeOffsetMs =
      typeof body?.timeOffsetMs === "number" ? body.timeOffsetMs : 0;
    const type = rec?.type === "video" ? "video" : "screenshot";

    const exists =
      type === "video"
        ? doesVideoFileExist(rec, timeOffsetMs)
        : doesScreenshotFileExist(rec, timeOffsetMs);

    return NextResponse.json({ exists, type });
  } catch (e: any) {
    return NextResponse.json({ exists: false, error: e.message }, { status: 500 });
  }
}
