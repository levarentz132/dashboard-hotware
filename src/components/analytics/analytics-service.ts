/**
 * Analytics service - handles IoT sensor data and utilities
 */

import type { SensorStatus } from "./types";

// ============================================
// Sensor Status Utilities
// ============================================

/**
 * Get temperature status color and label
 */
export function getTemperatureStatus(value: number | null): SensorStatus {
  if (value === null) return { color: "bg-gray-100 text-gray-600", status: "Unknown" };
  if (value < 20) return { color: "bg-blue-100 text-blue-700", status: "Cold" };
  if (value < 26) return { color: "bg-green-100 text-green-700", status: "Normal" };
  if (value < 30) return { color: "bg-yellow-100 text-yellow-700", status: "Warm" };
  return { color: "bg-red-100 text-red-700", status: "Hot" };
}

/**
 * Get humidity status color and label
 */
export function getHumidityStatus(value: number | null): SensorStatus {
  if (value === null) return { color: "bg-gray-100 text-gray-600", status: "Unknown" };
  if (value < 30) return { color: "bg-yellow-100 text-yellow-700", status: "Dry" };
  if (value < 60) return { color: "bg-green-100 text-green-700", status: "Normal" };
  if (value < 80) return { color: "bg-blue-100 text-blue-700", status: "Humid" };
  return { color: "bg-purple-100 text-purple-700", status: "Very Humid" };
}

// ============================================
// Formatting Utilities
// ============================================

/**
 * Format time for display
 */
export function formatTime(date: Date | null): string {
  if (!date) return "-";
  return date.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format temperature value
 */
export function formatTemperature(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}°C`;
}

/**
 * Format humidity value
 */
export function formatHumidity(value: number | null): string {
  if (value === null) return "-";
  return `${value.toFixed(1)}%`;
}

// ============================================
// Trend Utilities
// ============================================

export type TrendDirection = "up" | "down" | "stable";

/**
 * Get trend direction based on value change
 */
export function getTrendDirection(current: number | null, previous: number | null): TrendDirection {
  if (current === null || previous === null) return "stable";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "stable";
}

// ============================================
// Chart Utilities
// ============================================

/**
 * Format timestamp for chart axis
 */
export function formatChartTime(timestamp: Date): string {
  return timestamp.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get chart color for temperature
 */
export function getTemperatureChartColor(): string {
  return "#ef4444"; // red-500
}

/**
 * Get chart color for humidity
 */
export function getHumidityChartColor(): string {
  return "#3b82f6"; // blue-500
}
