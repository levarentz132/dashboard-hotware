import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface District extends RowDataPacket {
  id: string;
  regency_id: string;
  name: string;
}

// GET - Fetch districts by regency_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regencyId = searchParams.get("regency_id");

    if (!regencyId) {
      return NextResponse.json({ error: "regency_id is required" }, { status: 400 });
    }

    const [rows] = await db.execute<District[]>(
      "SELECT id, regency_id, name FROM districts WHERE regency_id = ? ORDER BY name ASC",
      [regencyId]
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[Districts API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch districts" }, { status: 500 });
  }
}
