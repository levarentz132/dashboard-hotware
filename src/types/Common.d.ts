/**
 * Common type definitions used across the application
 */

/**
 * Generic API response wrapper
 */
interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
  status: number;
}

/**
 * Paginated response structure
 */
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Standard error response
 */
interface ErrorResponse {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
  status: number;
}

/**
 * Loading state for UI components
 */
type LoadingState = "idle" | "loading" | "success" | "error";

/**
 * Async state for data fetching
 */
interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/**
 * Status types used throughout the app
 */
type StatusType = "online" | "offline" | "warning" | "critical" | "healthy" | "unknown";

/**
 * Badge variant types for shadcn components
 */
type StatusVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Database record with timestamps
 */
interface TimestampedRecord {
  created_at: Date;
  updated_at: Date;
}

/**
 * Sort direction
 */
type SortDirection = "asc" | "desc";

/**
 * Generic filter options
 */
interface FilterOptions {
  search?: string;
  status?: string;
  sortBy?: string;
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
}

/**
 * Map coordinates
 */
interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Server location data
 */
interface ServerLocation extends Coordinates {
  server_name: string;
}

export type {
  ApiResponse,
  PaginatedResponse,
  ErrorResponse,
  LoadingState,
  AsyncState,
  StatusType,
  StatusVariant,
  TimestampedRecord,
  SortDirection,
  FilterOptions,
  Coordinates,
  ServerLocation,
};
