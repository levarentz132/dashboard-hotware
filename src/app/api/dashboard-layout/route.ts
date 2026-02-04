import { NextRequest, NextResponse } from "next/server";
import {
  getLayoutsByUserId,
  getLayoutById,
  getActiveLayout,
  upsertLayoutByName,
  updateLayout,
  deleteLayout,
} from "@/lib/json-storage";

// GET - Fetch dashboard layout for user
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("user_id") || "default";
    const layoutId = searchParams.get("layout_id");
    const listAll = searchParams.get("list_all");

    // List all layouts for user
    if (listAll === "true") {
      const layouts = await getLayoutsByUserId(userId);
      // Return without layout_data for list view
      const layoutList = layouts.map(({ layout_data, ...rest }) => rest);
      return NextResponse.json({ layouts: layoutList });
    }

    // Get specific layout by ID
    if (layoutId) {
      const layout = await getLayoutById(parseInt(layoutId), userId);

      if (!layout) {
        return NextResponse.json({ layout: null });
      }

      return NextResponse.json({ layout });
    }

    // Get active layout for user
    const layout = await getActiveLayout(userId);

    if (!layout) {
      return NextResponse.json({ layout: null });
    }

    return NextResponse.json({ layout });
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

    const name = layout_name || `Layout ${new Date().toLocaleString("id-ID")}`;

    const { layout, isNew } = await upsertLayoutByName(user_id, name, layout_data, set_active);

    return NextResponse.json({
      message: isNew ? "Dashboard layout created successfully" : "Dashboard layout updated successfully",
      layout_id: layout.id,
    });
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

    const updates: {
      layout_name?: string;
      layout_data?: unknown;
      is_active?: boolean;
    } = {};

    if (layout_name !== undefined) {
      updates.layout_name = layout_name;
    }
    if (layout_data !== undefined) {
      updates.layout_data = layout_data;
    }
    if (set_active !== undefined) {
      updates.is_active = set_active;
    }

    const updatedLayout = await updateLayout(layout_id, user_id, updates);

    if (!updatedLayout) {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

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

    const deleted = await deleteLayout(parseInt(layoutId));

    if (!deleted) {
      return NextResponse.json({ error: "Layout not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Dashboard layout deleted successfully",
    });
  } catch (error) {
    console.error("[Dashboard Layout API] Error deleting:", error);
    return NextResponse.json({ error: "Failed to delete dashboard layout" }, { status: 500 });
  }
}
