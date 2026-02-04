import { NextRequest, NextResponse } from "next/server";
import {
  getAllServerLocations,
  getServerLocationByName,
  upsertServerLocation,
  deleteServerLocation,
} from "@/lib/json-storage";

// GET - Fetch all server locations or specific server by name
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const serverName = searchParams.get("server_name");

    if (serverName) {
      const location = await getServerLocationByName(serverName);

      if (!location) {
        return NextResponse.json({ location: null });
      }

      return NextResponse.json({ location });
    }

    const locations = await getAllServerLocations();
    return NextResponse.json({ locations });
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

    const { location, isNew } = await upsertServerLocation(
      server_name,
      latitude !== undefined && latitude !== null ? parseFloat(latitude) : null,
      longitude !== undefined && longitude !== null ? parseFloat(longitude) : null,
    );

    return NextResponse.json({
      message: isNew ? "Server location created successfully" : "Server location updated successfully",
      server_name: location.server_name,
      latitude: location.latitude,
      longitude: location.longitude,
    });
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

    const deleted = await deleteServerLocation(serverName);

    if (!deleted) {
      return NextResponse.json({ error: "Server location not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Server location deleted successfully",
      server_name: serverName,
    });
  } catch (error) {
    console.error("[Server Location API] Error deleting:", error);
    return NextResponse.json({ error: "Failed to delete server location" }, { status: 500 });
  }
}
