import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

interface DashboardLayout extends RowDataPacket {
  id: number;
  user_id: string;
  layout_name: string;
  layout_data: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// GET - Fetch dashboard layout for user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("user_id") || "default";
    const layoutId = searchParams.get("layout_id");
    const listAll = searchParams.get("list_all");

    // List all layouts for user
    if (listAll === "true") {
      const [rows] = await db.execute<DashboardLayout[]>(
        "SELECT id, user_id, layout_name, is_active, created_at, updated_at FROM dashboard_layout WHERE user_id = ? ORDER BY updated_at DESC",
        [userId]
      );
      return NextResponse.json({ layouts: rows });
    }

    // Get specific layout by ID
    if (layoutId) {
      const [rows] = await db.execute<DashboardLayout[]>(
        "SELECT * FROM dashboard_layout WHERE id = ? AND user_id = ?",
        [layoutId, userId]
      );

      if (rows.length === 0) {
        return NextResponse.json({ layout: null });
      }

      const layout = rows[0];
      return NextResponse.json({
        layout: {
          ...layout,
          layout_data: JSON.parse(layout.layout_data),
        },
      });
    }

    // Get active layout for user
    const [rows] = await db.execute<DashboardLayout[]>(
      "SELECT * FROM dashboard_layout WHERE user_id = ? AND is_active = 1 LIMIT 1",
      [userId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ layout: null });
    }

    const layout = rows[0];
    return NextResponse.json({
      layout: {
        ...layout,
        layout_data: JSON.parse(layout.layout_data),
      },
    });
  } catch (error) {
    console.error("[Dashboard Layout API] Error fetching:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard layout" }, { status: 500 });
  }
}

// POST - Create or update dashboard layout
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id = "default", layout_name, layout_data, set_active = true } = body;

    if (!layout_data) {
      return NextResponse.json({ error: "Layout data is required" }, { status: 400 });
    }

    const layoutJson = JSON.stringify(layout_data);
    const name = layout_name || `Layout ${new Date().toLocaleString("id-ID")}`;

    // If set_active, first deactivate all other layouts for this user
    if (set_active) {
      await db.execute<ResultSetHeader>("UPDATE dashboard_layout SET is_active = 0 WHERE user_id = ?", [user_id]);
    }

    // Check if there's an existing active layout to update
    const [existing] = await db.execute<DashboardLayout[]>(
      "SELECT id FROM dashboard_layout WHERE user_id = ? AND layout_name = ?",
      [user_id, name]
    );

    if (existing.length > 0) {
      // Update existing
      await db.execute<ResultSetHeader>(
        "UPDATE dashboard_layout SET layout_data = ?, is_active = ?, updated_at = NOW() WHERE id = ?",
        [layoutJson, set_active ? 1 : 0, existing[0].id]
      );

      return NextResponse.json({
        message: "Dashboard layout updated successfully",
        layout_id: existing[0].id,
      });
    } else {
      // Insert new
      const [result] = await db.execute<ResultSetHeader>(
        "INSERT INTO dashboard_layout (user_id, layout_name, layout_data, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())",
        [user_id, name, layoutJson, set_active ? 1 : 0]
      );

      return NextResponse.json({
        message: "Dashboard layout created successfully",
        layout_id: result.insertId,
      });
    }
  } catch (error) {
    console.error("[Dashboard Layout API] Error saving:", error);
    return NextResponse.json({ error: "Failed to save dashboard layout" }, { status: 500 });
  }
}

// PUT - Update specific layout or set as active
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { layout_id, user_id = "default", layout_name, layout_data, set_active } = body;

    if (!layout_id) {
      return NextResponse.json({ error: "Layout ID is required" }, { status: 400 });
    }

    // If setting as active, deactivate others first
    if (set_active) {
      await db.execute<ResultSetHeader>("UPDATE dashboard_layout SET is_active = 0 WHERE user_id = ?", [user_id]);
    }

    // Build update query dynamically
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (layout_name) {
      updates.push("layout_name = ?");
      values.push(layout_name);
    }

    if (layout_data) {
      updates.push("layout_data = ?");
      values.push(JSON.stringify(layout_data));
    }

    if (set_active !== undefined) {
      updates.push("is_active = ?");
      values.push(set_active ? 1 : 0);
    }

    updates.push("updated_at = NOW()");
    values.push(layout_id);

    await db.execute<ResultSetHeader>(`UPDATE dashboard_layout SET ${updates.join(", ")} WHERE id = ?`, values);

    return NextResponse.json({
      message: "Dashboard layout updated successfully",
      layout_id,
    });
  } catch (error) {
    console.error("[Dashboard Layout API] Error updating:", error);
    return NextResponse.json({ error: "Failed to update dashboard layout" }, { status: 500 });
  }
}

// DELETE - Remove dashboard layout
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const layoutId = searchParams.get("layout_id");

    if (!layoutId) {
      return NextResponse.json({ error: "Layout ID is required" }, { status: 400 });
    }

    await db.execute<ResultSetHeader>("DELETE FROM dashboard_layout WHERE id = ?", [layoutId]);

    return NextResponse.json({
      message: "Dashboard layout deleted successfully",
    });
  } catch (error) {
    console.error("[Dashboard Layout API] Error deleting:", error);
    return NextResponse.json({ error: "Failed to delete dashboard layout" }, { status: 500 });
  }
}
