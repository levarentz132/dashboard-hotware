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
} from "./dashboard-service";

// Components
export { default as DraggableDashboard, widgetRegistry, type WidgetType } from "./DraggableDashboard";
