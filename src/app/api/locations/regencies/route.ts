import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface Regency extends RowDataPacket {
  id: string;
  province_id: string;
  name: string;
}

// GET - Fetch regencies by province_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provinceId = searchParams.get("province_id");

    if (!provinceId) {
      return NextResponse.json({ error: "province_id is required" }, { status: 400 });
    }

    const [rows] = await db.execute<Regency[]>(
      "SELECT id, province_id, name FROM regencies WHERE province_id = ? ORDER BY name ASC",
      [provinceId]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[Regencies API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch regencies" }, { status: 500 });
  }
}
