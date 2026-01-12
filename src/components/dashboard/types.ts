/**
 * Dashboard types - interfaces for dashboard module
 */

import type { WidgetType } from "./DraggableDashboard";

export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  isDraggable?: boolean;
  isResizable?: boolean;
  static?: boolean;
}

export interface DashboardWidget {
  i: string; // unique instance id
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardLayout {
  id?: string;
  user_id: string;
  layout_name: string;
  layout_data: DashboardWidget[];
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExportedLayout {
  version: string;
  exportedAt: string;
  userId: string;
  widgets: DashboardWidget[];
}
