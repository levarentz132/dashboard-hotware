/**
 * Camera utility functions
 */

// ============================================
// Status Utilities
// ============================================

/**
 * Get status description for camera status
 */
export function getStatusDescription(status: string): string {
  const statusLower = status?.toLowerCase();
  switch (statusLower) {
    case "offline":
      return "The Device is inaccessible.";
    case "unauthorized":
      return "The Device does not have correct credentials in the database.";
    case "recording":
      return "The Camera is online and recording the video stream.";
    case "online":
      return "The Device is online and accessible.";
    case "notdefined":
      return "The Device status is unknown. It may show up while Servers synchronize status information.";
    case "incompatible":
      return "The Server is incompatible (different System name or incompatible protocol version).";
    case "mismatchedcertificate":
      return "Server's DB certificate doesn't match the SSL handshake certificate.";
    default:
      return "Status unknown";
  }
}

/**
 * Get badge style class for camera status
 */
export function getStatusBadgeStyle(status: string): string {
  const statusLower = status?.toLowerCase();
  switch (statusLower) {
    case "online":
    case "recording":
      return "bg-green-100 text-green-800 border-green-200";
    case "offline":
      return "bg-red-100 text-red-800 border-red-200";
    case "unauthorized":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "notdefined":
      return "bg-gray-100 text-gray-800 border-gray-200";
    case "incompatible":
    case "mismatchedcertificate":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default:
      return "bg-gray-100 text-gray-600 border-gray-200";
  }
}

// ============================================
// Filter Utilities
// ============================================

/**
 * Get unique vendors from cameras
 */
export function getUniqueVendors(cameras: { vendor?: string }[]): string[] {
  return Array.from(new Set(cameras.map((c) => c.vendor).filter(Boolean))).sort() as string[];
}
