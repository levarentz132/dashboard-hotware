/**
 * Dashboard barrel exports
 */

// Types
export type { LayoutItem, DashboardWidget, DashboardLayout, ExportedLayout } from "./types";

// Service functions
export {
  loadDashboardLayout,
  saveDashboardLayout,
  exportLayout,
  parseImportedLayout,
  generateWidgetId,
  widgetsToLayout,
  updateWidgetPositions,
} from "@/services/dashboard-service";

export { widgetRegistry, MemoizedWidget, type WidgetType } from "./widget-registry";

// Components
export { default as ModernDashboard } from "./Dashboard";
