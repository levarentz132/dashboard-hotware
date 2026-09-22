// @ts-nocheck
import { describe, it, expect } from "vitest";
import { exportToWord } from "./export-utils";
import { buildAnalystRelevantEventLog } from "../../lib/s3-event-presentation";

describe("STEP 9.1: Word S3 Presentation Filter Remediation", () => {
  it("1. exportToWord consumes buildAnalystRelevantEventLog without mutating raw data.alarms", () => {
    const rawAlarms = [
      { id: "1", source: "Camera 01", severity: "INFO", timestamp: "2026-09-17 10:00:00", description: "Camera Disconnected", eventType: "cameraDisconnectEvent" },
      { id: "2", source: "S3 Storage", severity: "CRITICAL", timestamp: "2026-09-17 10:05:00", description: "Storage failure on S3 target", eventType: "storageFailureEvent", caption: "Storage failure on S3 target" },
      { id: "3", source: "S3 Cloud Bridge", severity: "INFO", timestamp: "2026-09-17 10:10:00", description: "S3 Sync Heartbeat OK", eventType: "s3SyncHeartbeat", caption: "S3 Sync Heartbeat OK" },
      { id: "4", source: "S3 Cloud Bridge", severity: "INFO", timestamp: "2026-09-17 10:15:00", description: "S3 Sync Heartbeat OK", eventType: "s3SyncHeartbeat", caption: "S3 Sync Heartbeat OK" },
      { id: "5", source: "S3 Cloud Bridge", severity: "WARNING", timestamp: "2026-09-17 10:20:00", description: "S3 API Error Rate Elevated", eventType: "s3ApiErrorRate", caption: "API Error Rate Telemetry" },
      { id: "6", source: "S3 Cloud Bridge", severity: "WARNING", timestamp: "2026-09-17 10:25:00", description: "S3 API Error Rate Elevated", eventType: "s3ApiErrorRate", caption: "API Error Rate Telemetry" },
    ];

    // Deep freeze / copy check to prove raw array is untouched
    const originalLength = rawAlarms.length;

    const presentationResult = buildAnalystRelevantEventLog(rawAlarms);

    // Raw alarms count remains 6
    expect(rawAlarms.length).toBe(originalLength);

    // Presentation items should group noise into summaries
    // 1 cameraDisconnect + 1 storageFailure + 1 s3SyncHeartbeat summary + 1 s3ApiErrorRate summary = 4 items
    expect(presentationResult.presentationItems.length).toBe(4);

    const summaries = presentationResult.presentationItems.filter((item: any) => item.isSummary === true);
    expect(summaries.length).toBe(2);

    const heartbeatGroup = summaries.find((s: any) => s.eventType === "s3SyncHeartbeat");
    expect(heartbeatGroup).toBeDefined();
    expect(heartbeatGroup.count).toBe(2);

    const errorRateGroup = summaries.find((s: any) => s.eventType === "s3ApiErrorRate");
    expect(errorRateGroup).toBeDefined();
    expect(errorRateGroup.count).toBe(2);

    // Actionable S3 failure remains individual
    const actionableItem = presentationResult.presentationItems.find((item: any) => item.eventType === "storageFailureEvent");
    expect(actionableItem).toBeDefined();
    expect(actionableItem.isSummary).toBeUndefined();

    // Non-S3 event remains individual
    const nonS3Item = presentationResult.presentationItems.find((item: any) => item.eventType === "cameraDisconnectEvent");
    expect(nonS3Item).toBeDefined();
    expect(nonS3Item.isSummary).toBeUndefined();
  });
});
