/**
 * Central export for all types
 * Organized by domain for better maintainability
 */

// Re-export device types
export type { ICamera, IDeviceType } from "./Device";

// Re-export server types
export type { IServer } from "./Server";

// Re-export cloud types
export type { CloudSystem } from "./Cloud";

// Re-export common types
export type {
  ApiResponse,
  PaginatedResponse,
  ErrorResponse,
  LoadingState,
  AsyncState,
  StatusType,
  StatusVariant,
} from "./Common";

// Re-export validation types
export type { Camera, CameraForm } from "@/validations/camera-validation";
