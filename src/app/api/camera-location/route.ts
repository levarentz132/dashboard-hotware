import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface CameraLocation extends RowDataPacket {
  id: number;
  camera_name: string;
  detail_address: string;
  province_id: string;
  regency_id: string;
  district_id: string;
  village_id: string;
  created_at: Date;
  updated_at: Date;
}

// GET - Fetch all camera locations or by camera_name
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cameraName = searchParams.get("camera_name");

    if (cameraName) {
      // Get specific camera location with joined names
      const [rows] = await db.execute<CameraLocation[]>(
        `SELECT cl.*, 
          p.name as province_name, 
          r.name as regency_name, 
          d.name as district_name, 
          v.name as village_name
        FROM camera_location cl
        LEFT JOIN provinces p ON cl.province_id = p.id
        LEFT JOIN regencies r ON cl.regency_id = r.id
        LEFT JOIN districts d ON cl.district_id = d.id
        LEFT JOIN villages v ON cl.village_id = v.id
        WHERE cl.camera_name = ?`,
        [cameraName]
      );
      return NextResponse.json(rows[0] || null);
    }

    // Get all camera locations with joined names
    const [rows] = await db.execute<CameraLocation[]>(
      `SELECT cl.*, 
        p.name as province_name, 
        r.name as regency_name, 
        d.name as district_name, 
        v.name as village_name
      FROM camera_location cl
      LEFT JOIN provinces p ON cl.province_id = p.id
      LEFT JOIN regencies r ON cl.regency_id = r.id
      LEFT JOIN districts d ON cl.district_id = d.id
      LEFT JOIN villages v ON cl.village_id = v.id
      ORDER BY cl.camera_name ASC`
    );
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[Camera Location API] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch camera locations" }, { status: 500 });
  }
}

// POST - Create new camera location
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { camera_name, detail_address, province_id, regency_id, district_id, village_id } = body;

    if (!camera_name) {
      return NextResponse.json({ error: "Camera name is required" }, { status: 400 });
    }

    // Check if camera already exists
    const [existing] = await db.execute<CameraLocation[]>("SELECT * FROM camera_location WHERE camera_name = ?", [
      camera_name,
    ]);

    if (existing.length > 0) {
      return NextResponse.json({ error: "Camera location already exists. Use PUT to update." }, { status: 409 });
    }

    // Insert new camera location
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO camera_location (camera_name, detail_address, province_id, regency_id, district_id, village_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        camera_name,
        detail_address || "",
        province_id || null,
        regency_id || null,
        district_id || null,
        village_id || null,
      ]
    );

    return NextResponse.json({
      success: true,
      id: result.insertId,
      camera_name,
      detail_address: detail_address || "",
      province_id,
      regency_id,
      district_id,
      village_id,
    });
  } catch (error) {
    console.error("[Camera Location API] POST error:", error);
    return NextResponse.json({ error: "Failed to create camera location" }, { status: 500 });
  }
}

// PUT - Update camera location
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { camera_name, detail_address, province_id, regency_id, district_id, village_id } = body;

    if (!camera_name) {
      return NextResponse.json({ error: "Camera name is required" }, { status: 400 });
    }

    // Check if camera exists
    const [existing] = await db.execute<CameraLocation[]>("SELECT * FROM camera_location WHERE camera_name = ?", [
      camera_name,
    ]);

    if (existing.length === 0) {
      // Create if doesn't exist
      const [result] = await db.execute<ResultSetHeader>(
        `INSERT INTO camera_location (camera_name, detail_address, province_id, regency_id, district_id, village_id) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          camera_name,
          detail_address || "",
          province_id || null,
          regency_id || null,
          district_id || null,
          village_id || null,
        ]
      );

      return NextResponse.json({
        success: true,
        created: true,
        id: result.insertId,
        camera_name,
        detail_address: detail_address || "",
        province_id,
        regency_id,
        district_id,
        village_id,
      });
    }

    // Update existing
    await db.execute(
      `UPDATE camera_location 
       SET detail_address = ?, province_id = ?, regency_id = ?, district_id = ?, village_id = ? 
       WHERE camera_name = ?`,
      [
        detail_address || "",
        province_id || null,
        regency_id || null,
        district_id || null,
        village_id || null,
        camera_name,
      ]
    );

    return NextResponse.json({
      success: true,
      updated: true,
      camera_name,
      detail_address: detail_address || "",
      province_id,
      regency_id,
      district_id,
      village_id,
    });
  } catch (error) {
    console.error("[Camera Location API] PUT error:", error);
    return NextResponse.json({ error: "Failed to update camera location" }, { status: 500 });
  }
}

// DELETE - Delete camera location
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cameraName = searchParams.get("camera_name");

    if (!cameraName) {
      return NextResponse.json({ error: "Camera name is required" }, { status: 400 });
    }

    const [result] = await db.execute<ResultSetHeader>("DELETE FROM camera_location WHERE camera_name = ?", [
      cameraName,
    ]);

    if (result.affectedRows === 0) {
      return NextResponse.json({ error: "Camera location not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      camera_name: cameraName,
    });
  } catch (error) {
    console.error("[Camera Location API] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete camera location" }, { status: 500 });
  }
}
