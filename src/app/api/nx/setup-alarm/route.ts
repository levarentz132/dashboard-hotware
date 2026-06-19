import { NextRequest, NextResponse } from "next/server";
import { fetchFromCloudApi, postToCloudApi, validateSystemId } from "@/lib/cloud-api";
import crypto from "crypto";

/**
 * POST /api/nx/setup-alarm
 * Setup a camera disconnect alarm rule (desktop notification) in the target VMS system.
 */
export async function POST(request: NextRequest) {
  try {
    const { systemId, systemName } = validateSystemId(request);

    if (!systemId) {
      return NextResponse.json({ error: "System ID is required" }, { status: 400 });
    }

    const sysName = systemName || "VMS Server";

    // 1. Fetch existing event rules
    console.log(`[Setup Alarm] Checking rules on VMS ${sysName} (${systemId})...`);
    
    const rulesResponse = await fetchFromCloudApi<any[]>(request, {
      systemId,
      systemName: sysName,
      endpoint: "/rest/v4/events/rules",
    });

    if (!rulesResponse.ok) {
      // If VMS returns 404, it might be an older server version that doesn't support the v4 rules API
      if (rulesResponse.status === 404) {
        return NextResponse.json({
          success: false,
          error: "VMS version mismatch",
          details: "This server runs an older VMS version which does not support the REST rules API. Please configure rules manually via the NX desktop client."
        }, { status: 405 });
      }

      const errorData = await rulesResponse.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: "Failed to fetch existing rules",
        details: errorData
      }, { status: rulesResponse.status });
    }

    const rules = await rulesResponse.json();
    if (!Array.isArray(rules)) {
      return NextResponse.json({
        success: false,
        error: "Invalid response from VMS",
        details: "Expected an array of event rules."
      }, { status: 502 });
    }

    // 2. Search for existing camera disconnect rule with desktop notification action
    const existingRule = rules.find(
      (r: any) => r.event?.type === "deviceDisconnected" && r.action?.type === "desktopNotification"
    );

    if (existingRule) {
      console.log(`[Setup Alarm] Alarm rule already exists on ${sysName}.`);
      return NextResponse.json({
        success: true,
        alreadyConfigured: true,
        ruleId: existingRule.id,
        message: "Camera disconnect desktop alarm is already configured on this server."
      });
    }

    // 3. Construct and create the new rule
    const newRuleId = `{${crypto.randomUUID()}}`;
    const newRule = {
      id: newRuleId,
      event: {
        devices: {
          acceptAll: true
        },
        type: "deviceDisconnected"
      },
      action: {
        acknowledge: false,
        intervalS: 10, // Cooldown interval in seconds
        type: "desktopNotification",
        users: {
          acceptAll: true
        }
      },
      enabled: true,
      schedule: [],
      comment: "Trigger desktop notification alarm when any camera is disconnected (Configured via Dashboard)"
    };

    console.log(`[Setup Alarm] Rule not found on ${sysName}. Creating rule with ID ${newRuleId}...`);

    const createResponse = await postToCloudApi<any>(request, {
      systemId,
      systemName: sysName,
      endpoint: "/rest/v4/events/rules",
      body: newRule
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}));
      console.error(`[Setup Alarm] Failed to create rule:`, errorData);
      return NextResponse.json({
        success: false,
        error: "Failed to create alarm rule",
        details: errorData
      }, { status: createResponse.status });
    }

    const createdData = await createResponse.json().catch(() => ({}));
    console.log(`[Setup Alarm] ✅ Successfully configured alarm rule on ${sysName}.`);

    return NextResponse.json({
      success: true,
      configured: true,
      ruleId: newRuleId,
      message: "Successfully configured camera disconnect desktop alarm on this server.",
      details: createdData
    }, { status: 200 });

  } catch (error: any) {
    console.error("[Setup Alarm] Error:", error);
    return NextResponse.json({
      success: false,
      error: "Internal server error during alarm setup",
      details: error.message
    }, { status: 500 });
  }
}
