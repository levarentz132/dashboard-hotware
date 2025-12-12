import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface Village extends RowDataPacket {
  id: string;
  district_id: string;
  name: string;
}

// GET - Fetch villages by district_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const districtId = searchParams.get("district_id");

    if (!districtId) {
      return NextResponse.json({ error: "district_id is required" }, { status: 400 });
    }

    const [rows] = await db.execute<Village[]>(
      "SELECT id, district_id, name FROM villages WHERE district_id = ? ORDER BY name ASC",
      [districtId]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[Villages API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch villages" }, { status: 500 });
  }
}
