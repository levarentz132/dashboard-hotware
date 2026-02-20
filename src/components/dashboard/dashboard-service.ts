/**
 * Dashboard service - handles dashboard layout persistence
 */

import type { DashboardWidget, DashboardLayout, ExportedLayout } from "./types";

// ============================================
// Layout Persistence API
// ============================================

/**
 * Load dashboard layout from database
 */
export async function loadDashboardLayout(userId: string, deviceType?: string): Promise<{ widgets: DashboardWidget[]; layout_id?: number; error?: string }> {
  try {
    const params = new URLSearchParams({ user_id: userId });
    if (deviceType) params.append("device", deviceType);

    const response = await fetch(`/api/dashboard-layout?${params.toString()}`);
    const data = await response.json();

    if (response.ok && data.success) {
      if (data.layout?.layout_data) {
        return {
          widgets: data.layout.layout_data,
          layout_id: data.layout.id || data.layout.layout_id
        };
      }
    }

    return { widgets: [] };
  } catch (error) {
    console.error("Error loading layout:", error);
    return { widgets: [], error: "Failed to load layout" };
  }
}

/**
 * Save dashboard layout to database (Unified Upsert)
 */
export async function saveDashboardLayout(
  userId: string,
  widgets: DashboardWidget[],
  layoutName: string = "Default Layout",
  layoutId?: number,
  deviceType?: string
): Promise<{ success: boolean; error?: string; layout_id?: number }> {
  try {
    const response = await fetch("/api/dashboard-layout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        layout_name: layoutName,
        layout_data: widgets,
        set_active: true,
        layout_id: layoutId, // Pass id for updates
        device_type: (() => { console.log("[dashboard-service] saveDashboardLayout deviceType:", deviceType); return deviceType || "desktop"; })(),
      }),
    });

    const data = await response.json();
    if (response.ok && data.success) {
      return { success: true, layout_id: data.layout_id };
    }

    return { success: false, error: data.error || "Failed to save layout" };
  } catch (error) {
    console.error("Error saving layout:", error);
    return { success: false, error: "Failed to save layout" };
  }
}

/**
 * Update existing dashboard layout (Convenience wrapper for save)
 */
export async function updateDashboardLayout(
  layoutId: number,
  userId: string,
  updates: {
    layout_name?: string;
    layout_data?: DashboardWidget[];
    set_active?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  return saveDashboardLayout(
    userId,
    updates.layout_data || [],
    updates.layout_name || "Default Layout",
    layoutId
  );
}

/**
 * Delete dashboard layout
 */
export async function deleteDashboardLayout(layoutId?: number, deviceType?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams();
    if (layoutId) params.append("layout_id", layoutId.toString());
    if (deviceType) params.append("device", deviceType);

    const response = await fetch(`/api/dashboard-layout?${params.toString()}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (response.ok && data.success) {
      return { success: true };
    }

    return { success: false, error: data.error || "Failed to delete layout" };
  } catch (error) {
    console.error("Error deleting layout:", error);
    return { success: false, error: "Failed to delete layout" };
  }
}

// ============================================
// Layout Import/Export
// ============================================

/**
 * Export layout as JSON file
 */
export function exportLayout(userId: string, widgets: DashboardWidget[]): void {
  const exportData: ExportedLayout = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    userId,
    widgets,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dashboard-layout-${userId}-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Parse imported layout file
 */
export function parseImportedLayout(
  content: string,
  validWidgetTypes: string[]
): { widgets: DashboardWidget[]; error?: string } {
  try {
    const importedData = JSON.parse(content);

    if (!importedData.widgets || !Array.isArray(importedData.widgets)) {
      return { widgets: [], error: "Invalid format: missing widgets array" };
    }

    // Validate each widget
    const validWidgets = importedData.widgets.filter(
      (w: DashboardWidget) =>
        w.i &&
        w.type &&
        validWidgetTypes.includes(w.type) &&
        typeof w.x === "number" &&
        typeof w.y === "number" &&
        typeof w.w === "number" &&
        typeof w.h === "number"
    );

    if (validWidgets.length === 0) {
      return { widgets: [], error: "No valid widgets found" };
    }

    return { widgets: validWidgets };
  } catch (error) {
    console.error("Error parsing layout:", error);
    return { widgets: [], error: "Invalid JSON format" };
  }
}

// ============================================
// Layout Utilities
// ============================================

/**
 * Generate unique widget ID
 */
export function generateWidgetId(): string {
  return `widget-${Date.now()}`;
}

/**
 * Convert widgets to react-grid-layout format
 */
export function widgetsToLayout(
  widgets: DashboardWidget[],
  widgetRegistry: Record<string, { minSize: { w: number; h: number } }>,
  isEditing: boolean
): Array<{
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  isDraggable: boolean;
  isResizable: boolean;
}> {
  return widgets.map((widget) => {
    const config = widgetRegistry[widget.type];
    return {
      i: widget.i,
      x: widget.x,
      y: widget.y,
      w: widget.w,
      h: widget.h,
      minW: config?.minSize.w || 2,
      minH: config?.minSize.h || 2,
      isDraggable: isEditing,
      isResizable: isEditing,
    };
  });
}

/**
 * Update widget positions from layout change
 */
export function updateWidgetPositions(
  widgets: DashboardWidget[],
  newLayout: ReadonlyArray<{ i: string; x: number; y: number; w: number; h: number }>
): DashboardWidget[] {
  return widgets.map((widget) => {
    const layoutItem = newLayout.find((l) => l.i === widget.i);
    if (layoutItem) {
      return {
        ...widget,
        x: layoutItem.x,
        y: layoutItem.y,
        w: layoutItem.w,
        h: layoutItem.h,
      };
    }
    return widget;
  });
}
