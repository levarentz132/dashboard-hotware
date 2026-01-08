import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface ServerLocation extends RowDataPacket {
  id: number;
  server_name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: Date;
  updated_at: Date;
}

// GET - Fetch all server locations or specific server by name
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serverName = searchParams.get("server_name");

    if (serverName) {
      const [rows] = await db.execute<ServerLocation[]>("SELECT * FROM server_location WHERE server_name = ?", [
        serverName,
      ]);

      if (rows.length === 0) {
        return NextResponse.json({ location: null });
      }

      return NextResponse.json({ location: rows[0] });
    }

    const [rows] = await db.execute<ServerLocation[]>("SELECT * FROM server_location ORDER BY server_name");

    return NextResponse.json({ locations: rows });
  } catch (error) {
    console.error("[Server Location API] Error fetching:", error);
    return NextResponse.json({ error: "Failed to fetch server locations" }, { status: 500 });
  }
}

// POST - Create or update server location (upsert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { server_name, latitude, longitude } = body;

    if (!server_name) {
      return NextResponse.json({ error: "Server name is required" }, { status: 400 });
    }

    // Validate latitude and longitude if provided
    if (latitude !== null && latitude !== undefined) {
      const lat = parseFloat(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ error: "Latitude must be between -90 and 90" }, { status: 400 });
      }
    }

    if (longitude !== null && longitude !== undefined) {
      const lng = parseFloat(longitude);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ error: "Longitude must be between -180 and 180" }, { status: 400 });
      }
    }

    // Check if server already exists
    const [existing] = await db.execute<ServerLocation[]>("SELECT * FROM server_location WHERE server_name = ?", [
      server_name,
    ]);

    if (existing.length > 0) {
      // Update existing
      await db.execute<ResultSetHeader>(
        "UPDATE server_location SET latitude = ?, longitude = ?, updated_at = NOW() WHERE server_name = ?",
        [latitude || null, longitude || null, server_name]
      );

      return NextResponse.json({
        message: "Server location updated successfully",
        server_name,
        latitude: latitude || null,
        longitude: longitude || null,
      });
    } else {
      // Insert new
      await db.execute<ResultSetHeader>(
        "INSERT INTO server_location (server_name, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
        [server_name, latitude || null, longitude || null]
      );

      return NextResponse.json({
        message: "Server location created successfully",
        server_name,
        latitude: latitude || null,
        longitude: longitude || null,
      });
    }
  } catch (error) {
    console.error("[Server Location API] Error saving:", error);
    return NextResponse.json({ error: "Failed to save server location" }, { status: 500 });
  }
}

// DELETE - Remove server location
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serverName = searchParams.get("server_name");

    if (!serverName) {
      return NextResponse.json({ error: "Server name is required" }, { status: 400 });
    }

    await db.execute<ResultSetHeader>("DELETE FROM server_location WHERE server_name = ?", [serverName]);

    return NextResponse.json({
      message: "Server location deleted successfully",
      server_name: serverName,
    });
  } catch (error) {
    console.error("[Server Location API] Error deleting:", error);
    return NextResponse.json({ error: "Failed to delete server location" }, { status: 500 });
  }
}
