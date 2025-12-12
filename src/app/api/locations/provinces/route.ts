import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket } from "mysql2";

interface Province extends RowDataPacket {
  id: string;
  name: string;
}

// GET - Fetch all provinces
export async function GET() {
  try {
    const [rows] = await db.execute<Province[]>("SELECT id, name FROM provinces ORDER BY name ASC");
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[Provinces API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch provinces" }, { status: 500 });
  }
}
