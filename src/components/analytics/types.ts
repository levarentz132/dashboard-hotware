/**
 * Analytics types - interfaces for IoT analytics module
 */

export interface SensorData {
  value: number | null;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  previousValue: number | null;
}

export interface SensorHistory {
  timestamp: Date;
  temperature: number | null;
  humidity: number | null;
}

export interface SSEData {
  temperature: number | null;
  humidity: number | null;
  timestamp: string;
  error?: string;
}

export type ConnectionMode = "realtime" | "polling";

export interface SensorStatus {
  color: string;
  status: string;
}
