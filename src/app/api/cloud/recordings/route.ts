import { NextRequest, NextResponse } from "next/server";
import { buildCloudUrl, buildCloudHeaders, validateSystemId, getBasicAuthHeaderFromRequest } from "@/lib/cloud-api";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const { systemId, systemName } = validateSystemId(request);
    const deviceIdRaw = searchParams.get("deviceId") || "";
    const deviceId = deviceIdRaw.replace(/[{}]/g, "");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!systemId || !deviceId) {
      return NextResponse.json(
        { error: "systemId and deviceId are required" },
        { status: 400 }
      );
    }

    // Build query params for recorded time periods
    const params = new URLSearchParams();
    params.set("cameraId", deviceIdRaw);
    if (startTime) params.set("startTime", startTime);
    if (endTime) params.set("endTime", endTime);
    params.set("detail", "2"); // Get detailed periods

    const cloudUrl = buildCloudUrl(systemId, "/ec2/recordedTimePeriods", params, request, systemName || undefined);
    const headers = buildCloudHeaders(request, systemId);

    let response = await fetch(cloudUrl, {
      method: "GET",
      headers,
    });

    if (response.status === 401 || response.status === 403) {
      const basicAuthHeader = getBasicAuthHeaderFromRequest(request);
      if (basicAuthHeader) {
        const retryHeaders: Record<string, string> = {
          ...headers,
          Authorization: basicAuthHeader,
        };
        delete retryHeaders["x-runtime-guid"];

        console.warn("[recordings] Retrying recordedTimePeriods with Basic auth");
        response = await fetch(cloudUrl, {
          method: "GET",
          headers: retryHeaders,
        });
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[recordings] Error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to fetch recordings: ${response.status}`, details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Log raw response for debugging
    console.log("[recordings] Raw response sample:", JSON.stringify(data).substring(0, 500));
    
    // NX API returns { reply: [{ guid: "serverId", periods: [{startTimeMs, durationMs}] }] }
    // We need to flatten all periods from all servers
    let allPeriods: any[] = [];
    
    const replyItems = Array.isArray(data) ? data : (data?.reply || []);
    
    for (const item of replyItems) {
      // Each item may have a 'periods' array (per-server response) or be a period itself
      const periods = item.periods || (item.startTimeMs ? [item] : []);
      
      for (const p of periods) {
        // Parse timestamps - they come as strings from NX API
        let startTimeMs = parseInt(p.startTimeMs || p.startTime || '0', 10);
        let durationMs = parseInt(p.durationMs || p.duration || '0', 10);
        
        // If in microseconds (> year 2100 in ms), convert to ms
        if (startTimeMs > 4102444800000) {
          startTimeMs = Math.floor(startTimeMs / 1000);
        }
        if (durationMs > 86400000000) { // 1 day in usec
          durationMs = Math.floor(durationMs / 1000);
        }
        
        allPeriods.push({
          ...p,
          startTimeMs,
          durationMs,
          serverId: item.guid || p.guid,
        });
      }
    }
    
    // 2. Fetch local screenshots from data folder as requested
    try {
      const screenshotsDir = path.join(process.cwd(), "data", "recorded_screenshots", deviceId);
      if (fs.existsSync(screenshotsDir)) {
        const files = fs.readdirSync(screenshotsDir);
        for (const file of files) {
          if (file.endsWith(".png")) {
            const timestamp = parseInt(file.replace(".png", ""), 10);
            const startLimit = startTime ? parseInt(startTime, 10) : 0;
            const endLimit = endTime ? parseInt(endTime, 10) : Infinity;

            if (timestamp >= startLimit && timestamp <= endLimit) {
              // Check if we already have a record for this exact millisecond
              const exists = allPeriods.some(p => p.startTimeMs === timestamp && p.durationMs === 0);
              if (!exists) {
                allPeriods.push({
                  startTimeMs: timestamp,
                  durationMs: 0,
                  isScreenshot: true,
                  isLocal: true,
                  serverId: "local-storage",
                });
              }
            }
          }
        }
        // Sort by start time descending (newest first)
        allPeriods.sort((a, b) => b.startTimeMs - a.startTimeMs);
      }
    } catch (err) {
      console.warn("[recordings] Failed to scan local screenshots:", err);
    }
    
    return NextResponse.json(allPeriods);
  } catch (error) {
    console.error("[recordings] Exception:", error);
    return NextResponse.json(
      { error: "Failed to fetch recordings" },
      { status: 500 }
    );
  }
}
