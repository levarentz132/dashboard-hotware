/**
 * Camera utility functions
 */

import type { CameraLocationData } from "./types";

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
// Location Formatting
// ============================================

/**
 * Format camera location (short version for cards)
 */
export function formatCameraLocation(location: CameraLocationData | null | undefined): string {
  if (!location) return "Lokasi belum diatur";

  const parts: string[] = [];

  if (location.village_name) parts.push(location.village_name);
  if (location.district_name) parts.push(location.district_name);
  if (location.regency_name) parts.push(location.regency_name);

  if (parts.length === 0) return "Lokasi belum diatur";

  return parts.join(", ");
}

/**
 * Format camera location (full version for tooltip/details)
 */
export function formatCameraLocationFull(location: CameraLocationData | null | undefined): string {
  if (!location) return "Lokasi belum diatur";

  const lines: string[] = [];

  if (location.detail_address) lines.push(`📍 ${location.detail_address}`);
  if (location.village_name) lines.push(`🏘️ Kel. ${location.village_name}`);
  if (location.district_name) lines.push(`🏛️ Kec. ${location.district_name}`);
  if (location.regency_name) lines.push(`🏙️ ${location.regency_name}`);
  if (location.province_name) lines.push(`🗺️ ${location.province_name}`);

  if (lines.length === 0) return "Lokasi belum diatur";

  return lines.join("\n");
}

/**
 * Search in location data
 */
export function searchInLocation(location: CameraLocationData | null | undefined, term: string): boolean {
  if (!location) return false;
  const lowerTerm = term.toLowerCase();
  return (
    location.detail_address?.toLowerCase().includes(lowerTerm) ||
    location.village_name?.toLowerCase().includes(lowerTerm) ||
    location.district_name?.toLowerCase().includes(lowerTerm) ||
    location.regency_name?.toLowerCase().includes(lowerTerm) ||
    location.province_name?.toLowerCase().includes(lowerTerm) ||
    false
  );
}

// ============================================
// Filter Utilities
// ============================================

/**
 * Get unique values from camera locations
 */
export function getUniqueLocationValues(
  locations: Record<string, CameraLocationData | null>,
  field: keyof CameraLocationData,
  filterProvince?: string,
  filterDistrict?: string
): string[] {
  return Array.from(
    new Set(
      Object.values(locations)
        .filter((loc) => {
          if (!loc) return false;
          if (filterProvince && filterProvince !== "all" && loc.province_name !== filterProvince) {
            return false;
          }
          if (filterDistrict && filterDistrict !== "all" && loc.district_name !== filterDistrict) {
            return false;
          }
          return true;
        })
        .map((loc) => loc?.[field])
        .filter(Boolean)
    )
  ).sort() as string[];
}

/**
 * Get unique vendors from cameras
 */
export function getUniqueVendors(cameras: { vendor?: string }[]): string[] {
  return Array.from(new Set(cameras.map((c) => c.vendor).filter(Boolean))).sort() as string[];
}
