"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Thermometer,
  Droplets,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Wifi,
  WifiOff,
  Clock,
  Radio,
  Zap,
  BarChart3,
  Power,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";

interface SensorData {
  value: number | null;
  lastUpdated: Date | null;
  loading: boolean;
  error: string | null;
  previousValue: number | null;
}

interface SensorHistory {
  timestamp: Date;
  temperature: number | null;
  humidity: number | null;
}

interface SSEData {
  temperature: number | null;
  humidity: number | null;
  timestamp: string;
  error?: string;
}

type ConnectionMode = "realtime" | "polling";

export default function Analytics() {
  const [temperature, setTemperature] = useState<SensorData>({
    value: null,
    lastUpdated: null,
    loading: true,
    error: null,
    previousValue: null,
  });

  const [humidity, setHumidity] = useState<SensorData>({
    value: null,
    lastUpdated: null,
    loading: true,
    error: null,
    previousValue: null,
  });

  const [history, setHistory] = useState<SensorHistory[]>([]);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("realtime");
  const [isConnected, setIsConnected] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds for polling mode
  const [updateCount, setUpdateCount] = useState(0);

  // Power control state (v7)
  const [powerState, setPowerState] = useState<boolean>(false);
  const [powerLoading, setPowerLoading] = useState<boolean>(true);
  const [powerError, setPowerError] = useState<string | null>(null);
  const [powerLastUpdated, setPowerLastUpdated] = useState<Date | null>(null);

  const BLYNK_TOKEN = "cb9wrnFvTzQFz8DDqGHdftortKgiVd4W";
  const BLYNK_BASE_URL = "https://sgp1.blynk.cloud/external/api";

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch power state from Blynk API
  const fetchPowerState = useCallback(async () => {
    try {
      setPowerLoading(true);
      setPowerError(null);
      const response = await fetch(`${BLYNK_BASE_URL}/get?token=${BLYNK_TOKEN}&v7`);
      if (!response.ok) {
        throw new Error("Failed to fetch power state");
      }
      const data = await response.text();
      const value = parseInt(data, 10);
      setPowerState(value === 1);
      setPowerLastUpdated(new Date());
    } catch (err) {
      setPowerError(err instanceof Error ? err.message : "Unknown error");
      console.error("Error fetching power state:", err);
    } finally {
      setPowerLoading(false);
    }
  }, []);

  // Update power state via Blynk API
  const updatePowerState = useCallback(
    async (newState: boolean) => {
      try {
        setPowerLoading(true);
        setPowerError(null);
        const value = newState ? 1 : 0;
        const response = await fetch(`${BLYNK_BASE_URL}/update?token=${BLYNK_TOKEN}&v7=${value}`);
        if (!response.ok) {
          throw new Error("Failed to update power state");
        }
        setPowerState(newState);
        setPowerLastUpdated(new Date());
      } catch (err) {
        setPowerError(err instanceof Error ? err.message : "Unknown error");
        console.error("Error updating power state:", err);
        // Revert to previous state on error
        await fetchPowerState();
      } finally {
        setPowerLoading(false);
      }
    },
    [fetchPowerState],
  );

  // Fetch initial power state on mount
  useEffect(() => {
    fetchPowerState();
  }, [fetchPowerState]);

  // Process incoming sensor data (from SSE or polling)
  const processSensorData = useCallback((data: SSEData) => {
    const now = new Date(data.timestamp);

    if (data.error) {
      setTemperature((prev) => ({ ...prev, loading: false, error: data.error || "Unknown error" }));
      setHumidity((prev) => ({ ...prev, loading: false, error: data.error || "Unknown error" }));
      setIsConnected(false);
      return;
    }

    setIsConnected(true);
    setUpdateCount((prev) => prev + 1);

    // Update temperature
    if (data.temperature !== null) {
      setTemperature((prev) => ({
        value: data.temperature,
        lastUpdated: now,
        loading: false,
        error: null,
        previousValue: prev.value,
      }));
    }

    // Update humidity
    if (data.humidity !== null) {
      setHumidity((prev) => ({
        value: data.humidity,
        lastUpdated: now,
        loading: false,
        error: null,
        previousValue: prev.value,
      }));
    }

    // Add to history
    setHistory((prev) => {
      const newEntry: SensorHistory = {
        timestamp: now,
        temperature: data.temperature,
        humidity: data.humidity,
      };
      // Keep last 50 entries for realtime mode
      const updated = [...prev, newEntry].slice(-50);
      return updated;
    });
  }, []);

  // Connect to SSE stream for realtime updates
  const connectSSE = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setTemperature((prev) => ({ ...prev, loading: true }));
    setHumidity((prev) => ({ ...prev, loading: true }));

    const eventSource = new EventSource("/api/iot/stream");
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("SSE Connected");
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data: SSEData = JSON.parse(event.data);
        processSensorData(data);
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };

    eventSource.onerror = () => {
      console.error("SSE Error");
      setIsConnected(false);
      setTemperature((prev) => ({ ...prev, loading: false, error: "Connection lost. Reconnecting..." }));
      setHumidity((prev) => ({ ...prev, loading: false, error: "Connection lost. Reconnecting..." }));

      // Reconnect after 3 seconds
      setTimeout(() => {
        if (connectionMode === "realtime") {
          connectSSE();
        }
      }, 3000);
    };

    return () => {
      eventSource.close();
    };
  }, [connectionMode, processSensorData]);

  // Fetch data via polling (fallback mode)
  const fetchPolling = useCallback(async () => {
    try {
      setTemperature((prev) => ({ ...prev, loading: true }));
      setHumidity((prev) => ({ ...prev, loading: true }));

      const response = await fetch("/api/iot/stream", { method: "GET" });
      const reader = response.body?.getReader();

      if (reader) {
        const { value } = await reader.read();
        if (value) {
          const text = new TextDecoder().decode(value);
          const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine) {
            const jsonStr = dataLine.replace("data: ", "");
            const data: SSEData = JSON.parse(jsonStr);
            processSensorData(data);
          }
        }
        reader.cancel();
      }
    } catch (err) {
      console.error("Polling error:", err);
      setIsConnected(false);
    }
  }, [processSensorData]);

  // Handle connection mode changes
  useEffect(() => {
    // Cleanup previous connections
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (connectionMode === "realtime") {
      connectSSE();
    } else {
      // Polling mode
      fetchPolling();
      pollingIntervalRef.current = setInterval(fetchPolling, refreshInterval * 1000);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [connectionMode, refreshInterval, connectSSE, fetchPolling]);

  // Manual refresh
  const handleManualRefresh = () => {
    if (connectionMode === "realtime") {
      // Reconnect SSE
      connectSSE();
    } else {
      fetchPolling();
    }
  };

  // Get trend icon based on value change
  const getTrendIcon = (current: number | null, previous: number | null) => {
    if (current === null || previous === null) return <Minus className="w-4 h-4 text-gray-400" />;
    if (current > previous) return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (current < previous) return <TrendingDown className="w-4 h-4 text-blue-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  // Get temperature status color
  const getTemperatureStatus = (value: number | null) => {
    if (value === null) return { color: "bg-gray-100 text-gray-600", status: "Unknown" };
    if (value < 20) return { color: "bg-blue-100 text-blue-700", status: "Cold" };
    if (value < 26) return { color: "bg-green-100 text-green-700", status: "Normal" };
    if (value < 30) return { color: "bg-yellow-100 text-yellow-700", status: "Warm" };
    return { color: "bg-red-100 text-red-700", status: "Hot" };
  };

  // Get humidity status color
  const getHumidityStatus = (value: number | null) => {
    if (value === null) return { color: "bg-gray-100 text-gray-600", status: "Unknown" };
    if (value < 30) return { color: "bg-yellow-100 text-yellow-700", status: "Dry" };
    if (value < 60) return { color: "bg-green-100 text-green-700", status: "Normal" };
    if (value < 80) return { color: "bg-blue-100 text-blue-700", status: "Humid" };
    return { color: "bg-purple-100 text-purple-700", status: "Very Humid" };
  };

  // Format time
  const formatTime = (date: Date | null) => {
    if (!date) return "-";
    return date.toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const tempStatus = getTemperatureStatus(temperature.value);
  const humStatus = getHumidityStatus(humidity.value);
  const hasError = temperature.error || humidity.error;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">IoT Analytics</h1>
          <div className="flex items-center space-x-2">
            {isConnected && !hasError ? (
              <>
                {connectionMode === "realtime" ? (
                  <Radio className="w-4 h-4 text-green-500 animate-pulse" />
                ) : (
                  <Wifi className="w-4 h-4 text-green-500" />
                )}
                <span className="text-xs sm:text-sm text-green-600">
                  {connectionMode === "realtime" ? "Live" : "Connected"}
                </span>
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  {updateCount} updates
                </Badge>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-xs sm:text-sm text-red-600">Disconnected</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Connection Mode Toggle */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setConnectionMode("realtime")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                connectionMode === "realtime"
                  ? "bg-white shadow text-green-600 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Realtime</span>
            </button>
            <button
              onClick={() => setConnectionMode("polling")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                connectionMode === "polling"
                  ? "bg-white shadow text-blue-600 font-medium"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Polling</span>
            </button>
          </div>

          {/* Refresh Interval Selector (only for polling mode) */}
          {connectionMode === "polling" && (
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={5}>5s</option>
              <option value={10}>10s</option>
              <option value={30}>30s</option>
              <option value={60}>1m</option>
            </select>
          )}

          {/* Manual Refresh */}
          <Button
            onClick={handleManualRefresh}
            disabled={temperature.loading || humidity.loading}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${temperature.loading || humidity.loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Realtime Indicator Banner */}
      {connectionMode === "realtime" && isConnected && !hasError && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-3 flex items-center gap-3">
          <div className="relative">
            <Radio className="w-5 h-5 text-green-600" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-green-500 rounded-full animate-ping" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-green-800">Realtime Mode Active</p>
            <p className="text-xs text-green-600">Data updates every 2 seconds via Server-Sent Events (SSE)</p>
          </div>
        </div>
      )}

      {/* Power Control Card - Simple */}
      <Card className="overflow-hidden">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Left: Info */}
            <div className="flex items-center gap-4">
              <div
                className={`p-3 rounded-full transition-all duration-300 ${
                  powerState ? "bg-green-100" : "bg-gray-100"
                }`}
              >
                {powerLoading ? (
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                ) : (
                  <Power className={`w-6 h-6 transition-colors ${powerState ? "text-green-600" : "text-gray-400"}`} />
                )}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Kontrol Daya</h3>
                <p className="text-sm text-gray-500">
                  {powerLoading ? "Memproses..." : powerState ? "Device Aktif" : "Device Mati"}
                </p>
              </div>
            </div>

            {/* Right: Toggle */}
            <div className="flex items-center gap-3">
              {powerError && <span className="text-xs text-red-500 mr-2">{powerError}</span>}
              <button
                onClick={() => !powerLoading && updatePowerState(!powerState)}
                disabled={powerLoading}
                className={`relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  powerState ? "bg-green-500 focus:ring-green-500" : "bg-gray-300 focus:ring-gray-400"
                } ${powerLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
              >
                <span
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all duration-300 ${
                    powerState ? "left-7" : "left-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Sensor Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        {/* Temperature Card */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-orange-500 to-red-500 text-white pb-4">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Thermometer className="w-6 h-6" />
                <span>Suhu (Temperature)</span>
              </div>
              <Badge className={tempStatus.color}>{tempStatus.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {temperature.error ? (
              <div className="flex items-center justify-center p-4 text-red-500">
                <AlertCircle className="w-5 h-5 mr-2" />
                <span className="text-sm">{temperature.error}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-5xl md:text-6xl font-bold text-gray-900">
                        {temperature.loading ? (
                          <RefreshCw className="w-12 h-12 animate-spin text-gray-400" />
                        ) : temperature.value !== null ? (
                          temperature.value.toFixed(1)
                        ) : (
                          "-"
                        )}
                      </span>
                      {!temperature.loading && temperature.value !== null && (
                        <span className="text-2xl md:text-3xl text-gray-500">°C</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      {getTrendIcon(temperature.value, temperature.previousValue)}
                      {temperature.previousValue !== null && temperature.value !== null && (
                        <span className="text-sm text-gray-500">
                          {temperature.value > temperature.previousValue ? "+" : ""}
                          {(temperature.value - temperature.previousValue).toFixed(1)}°C
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Last Updated:</span>
                    <span className="font-medium">{formatTime(temperature.lastUpdated)}</span>
                  </div>
                </div>

                {/* Temperature Gauge */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0°C</span>
                    <span>25°C</span>
                    <span>50°C</span>
                  </div>
                  <div className="h-3 bg-gradient-to-r from-blue-400 via-green-400 via-yellow-400 to-red-500 rounded-full relative">
                    {temperature.value !== null && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-800 rounded-full shadow-lg transition-all duration-500"
                        style={{ left: `${Math.min(Math.max((temperature.value / 50) * 100, 0), 100)}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Humidity Card */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white pb-4">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Droplets className="w-6 h-6" />
                <span>Kelembaban (Humidity)</span>
              </div>
              <Badge className={humStatus.color}>{humStatus.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {humidity.error ? (
              <div className="flex items-center justify-center p-4 text-red-500">
                <AlertCircle className="w-5 h-5 mr-2" />
                <span className="text-sm">{humidity.error}</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-5xl md:text-6xl font-bold text-gray-900">
                        {humidity.loading ? (
                          <RefreshCw className="w-12 h-12 animate-spin text-gray-400" />
                        ) : humidity.value !== null ? (
                          humidity.value.toFixed(1)
                        ) : (
                          "-"
                        )}
                      </span>
                      {!humidity.loading && humidity.value !== null && (
                        <span className="text-2xl md:text-3xl text-gray-500">%</span>
                      )}
                    </div>
                    <div className="flex items-center justify-center gap-2 mt-2">
                      {getTrendIcon(humidity.value, humidity.previousValue)}
                      {humidity.previousValue !== null && humidity.value !== null && (
                        <span className="text-sm text-gray-500">
                          {humidity.value > humidity.previousValue ? "+" : ""}
                          {(humidity.value - humidity.previousValue).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Last Updated:</span>
                    <span className="font-medium">{formatTime(humidity.lastUpdated)}</span>
                  </div>
                </div>

                {/* Humidity Gauge */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                  <div className="h-3 bg-gradient-to-r from-yellow-400 via-green-400 to-blue-500 rounded-full relative">
                    {humidity.value !== null && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-800 rounded-full shadow-lg transition-all duration-500"
                        style={{ left: `${Math.min(Math.max(humidity.value, 0), 100)}%` }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-center">
            <Thermometer className="w-6 h-6 mx-auto text-orange-500 mb-2" />
            <div className="text-2xl font-bold text-gray-900">
              {temperature.value !== null ? `${temperature.value.toFixed(1)}°` : "-"}
            </div>
            <div className="text-xs text-gray-500">Current Temp</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <Droplets className="w-6 h-6 mx-auto text-blue-500 mb-2" />
            <div className="text-2xl font-bold text-gray-900">
              {humidity.value !== null ? `${humidity.value.toFixed(1)}%` : "-"}
            </div>
            <div className="text-xs text-gray-500">Current Humidity</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <TrendingUp className="w-6 h-6 mx-auto text-green-500 mb-2" />
            <div className="text-2xl font-bold text-gray-900">
              {history.length > 0 && history.some((h) => h.temperature !== null)
                ? `${Math.max(
                    ...history.filter((h) => h.temperature !== null).map((h) => h.temperature as number),
                  ).toFixed(1)}°`
                : "-"}
            </div>
            <div className="text-xs text-gray-500">Max Temp (Session)</div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-center">
            <TrendingDown className="w-6 h-6 mx-auto text-purple-500 mb-2" />
            <div className="text-2xl font-bold text-gray-900">
              {history.length > 0 && history.some((h) => h.temperature !== null)
                ? `${Math.min(
                    ...history.filter((h) => h.temperature !== null).map((h) => h.temperature as number),
                  ).toFixed(1)}°`
                : "-"}
            </div>
            <div className="text-xs text-gray-500">Min Temp (Session)</div>
          </div>
        </Card>
      </div>

      {/* Historical Chart */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                <span>Historical Chart</span>
              </div>
              <Badge variant="outline" className="text-xs">
                Last {Math.min(history.length, 30)} readings
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] md:h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={history.slice(-30).map((entry, index) => ({
                    time: entry.timestamp.toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    }),
                    temperature: entry.temperature,
                    humidity: entry.humidity,
                    index: index + 1,
                  }))}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.1} />
                    </linearGradient>
                    <linearGradient id="colorHumidity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fill: "#6b7280" }}
                    tickLine={{ stroke: "#d1d5db" }}
                    axisLine={{ stroke: "#d1d5db" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="temp"
                    orientation="left"
                    tick={{ fontSize: 10, fill: "#f97316" }}
                    tickLine={{ stroke: "#f97316" }}
                    axisLine={{ stroke: "#f97316" }}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    label={{
                      value: "°C",
                      angle: -90,
                      position: "insideLeft",
                      style: { textAnchor: "middle", fill: "#f97316", fontSize: 12 },
                    }}
                  />
                  <YAxis
                    yAxisId="humidity"
                    orientation="right"
                    tick={{ fontSize: 10, fill: "#3b82f6" }}
                    tickLine={{ stroke: "#3b82f6" }}
                    axisLine={{ stroke: "#3b82f6" }}
                    domain={[0, 100]}
                    label={{
                      value: "%",
                      angle: 90,
                      position: "insideRight",
                      style: { textAnchor: "middle", fill: "#3b82f6", fontSize: 12 },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "temperature") return [`${value?.toFixed(1)}°C`, "Suhu"];
                      if (name === "humidity") return [`${value?.toFixed(1)}%`, "Kelembaban"];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Waktu: ${label}`}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => {
                      if (value === "temperature") return "Suhu (°C)";
                      if (value === "humidity") return "Kelembaban (%)";
                      return value;
                    }}
                  />
                  <Area
                    yAxisId="temp"
                    type="monotone"
                    dataKey="temperature"
                    stroke="#f97316"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorTemp)"
                    dot={{ r: 3, fill: "#f97316" }}
                    activeDot={{ r: 5, fill: "#f97316", stroke: "white", strokeWidth: 2 }}
                    connectNulls
                  />
                  <Area
                    yAxisId="humidity"
                    type="monotone"
                    dataKey="humidity"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorHumidity)"
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5, fill: "#3b82f6", stroke: "white", strokeWidth: 2 }}
                    connectNulls
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Chart Legend Info */}
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-gray-600">Suhu (Temperature)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-gray-600">Kelembaban (Humidity)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Recent Readings</span>
              <Badge variant="outline" className="text-xs">
                {history.length} records
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="text-left py-2 px-3 font-medium text-gray-600">Time</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Temperature</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-600">Humidity</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history]
                    .reverse()
                    .slice(0, 20)
                    .map((entry, index) => (
                      <tr
                        key={index}
                        className={`border-b last:border-0 hover:bg-gray-50 ${index === 0 ? "bg-green-50" : ""}`}
                      >
                        <td className="py-2 px-3 text-gray-600">
                          {formatTime(entry.timestamp)}
                          {index === 0 && <Badge className="ml-2 text-xs bg-green-100 text-green-700">Latest</Badge>}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {entry.temperature !== null ? (
                            <span className="font-medium text-orange-600">{entry.temperature.toFixed(1)}°C</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {entry.humidity !== null ? (
                            <span className="font-medium text-blue-600">{entry.humidity.toFixed(1)}%</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connection Info */}
      <Card className="bg-gray-50">
        <CardContent className="py-4">
          <div className="text-xs text-gray-500 space-y-1">
            <p>
              <strong>Connection Mode:</strong>{" "}
              {connectionMode === "realtime"
                ? "Server-Sent Events (SSE) - 2s interval"
                : `Polling - ${refreshInterval}s interval`}
            </p>
            <p>
              <strong>Data Source:</strong> Blynk IoT Cloud
            </p>
            <p>
              <strong>Sensor Endpoints:</strong> Temperature (v4), Humidity (v5)
            </p>
            <p>
              <strong>Control Endpoint:</strong> Power Control (v7)
            </p>
            <p className="text-green-600">
              ✓ Realtime menggunakan SSE untuk data streaming tanpa perlu WebSocket server terpisah
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
