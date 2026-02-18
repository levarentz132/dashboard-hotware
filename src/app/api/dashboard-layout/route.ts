import { NextRequest, NextResponse } from "next/server";
import {
  getExternalDashboardLayout,
  saveExternalDashboardLayout,
  updateExternalDashboardLayout,
  deleteExternalDashboardLayout,
} from "@/lib/auth/external-api";
import { AUTH_CONFIG } from "@/lib/auth/constants";
import {
  getActiveLayout,
  upsertLayoutByName,
  updateLayout,
  deleteLayout,
} from "@/lib/json-storage";

// GET - Fetch dashboard layout for user
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("user_id") || "default";

    if (token) {
      const data = await getExternalDashboardLayout(token);
      if (data.success) {
        // Sync to local storage for future offline fallback
        const name = data.layout?.layout_name || "Default";
        if (data.layout) {
          await upsertLayoutByName(userId, name, data.layout.layout_data || data.layout.layout_json, true);
        }

        return NextResponse.json({
          success: true,
          layout: data.layout,
          message: data.message
        });
      }
    }

    // Fallback to local storage
    const layout = await getActiveLayout(userId);
    return NextResponse.json({
      success: true,
      layout: layout || null
    });
  } catch (error) {
    console.error("[Dashboard Layout API] Error fetching:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch dashboard layout" }, { status: 500 });
  }
}

// POST - Create or update dashboard layout (Unified Upsert)
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    const body = await request.json();
    const {
      user_id = "default",
      layout_name,
      layout_data,
      layout_json, // Add layout_json support
      set_active = true,
      layout_id
    } = body;

    const actualLayoutData = layout_data || layout_json;

    if (!actualLayoutData) {
      return NextResponse.json({ success: false, error: "Layout data is required" }, { status: 400 });
    }

    // Local Sync (Always update local so fallback is always fresh)
    const name = layout_name || `Layout ${new Date().toLocaleString("id-ID")}`;
    const { layout: localLayout, isNew: localIsNew } = await upsertLayoutByName(user_id, name, actualLayoutData, set_active);

    // External API Proxy
    if (token) {
      console.log(`[Dashboard Layout API] Proxying save to external API`);

      const payload = {
        layout_name: name,
        layout_data: actualLayoutData,
        set_active,
        ...(layout_id ? { layout_id } : {})
      };

      const data = await saveExternalDashboardLayout(token, payload);

      if (data.success) {
        return NextResponse.json({
          success: true,
          message: data.message || "Dashboard layout saved (Cloud + Local)",
          layout_id: data.layout_id,
        });
      }
    }

    // Return local successful response if cloud was skipped or failed
    return NextResponse.json({
      success: true,
      message: localIsNew ? "Dashboard layout created (Local only)" : "Dashboard layout updated (Local only)",
      layout_id: localLayout.id,
    });
  } catch (error) {
    console.error("[Dashboard Layout API] Error saving:", error);
    return NextResponse.json({ success: false, error: "Failed to save dashboard layout" }, { status: 500 });
  }
}

// PUT - Also use POST internally for update as requested
export async function PUT(request: NextRequest) {
  // Proxy to POST handler for unified upsert logic
  return POST(request);
}

// DELETE - Remove dashboard layout
export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get(AUTH_CONFIG.COOKIE_NAME)?.value;
    const searchParams = request.nextUrl.searchParams;
    const layoutId = searchParams.get("layout_id");

    if (!layoutId) {
      return NextResponse.json({ success: false, error: "Layout ID is required" }, { status: 400 });
    }

    if (token) {
      const data = await deleteExternalDashboardLayout(token, layoutId);
      if (data.success) {
        return NextResponse.json({ success: true, message: "Dashboard layout deleted successfully" });
      }
    }

    // Fallback to local storage
    const deleted = await deleteLayout(parseInt(layoutId));
    if (!deleted) {
      return NextResponse.json({ success: false, error: "Layout not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Dashboard layout deleted successfully" });
  } catch (error) {
    console.error("[Dashboard Layout API] Error deleting:", error);
    return NextResponse.json({ success: false, error: "Failed to delete dashboard layout" }, { status: 500 });
  }
}

