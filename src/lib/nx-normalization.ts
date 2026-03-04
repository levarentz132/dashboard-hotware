/**
 * Utility to normalize Nx Witness events from different API versions
 * Specifically handles v3 (older) and v4 (newer) formats
 */

export function normalizeNxEvent(event: any): any {
    // If it's already v4 format (has eventData)
    if (event.eventData && event.actionData) {
        return event;
    }

    // If it's v3 format (has eventParams or eventResourceId)
    if (event.eventParams || event.actionParams) {
        const ep = event.eventParams || {};
        const ap = event.actionParams || {};

        // v3 uses eventTimestampUsec (microseconds) vs v4 timestampMs (milliseconds)
        const timestampUsec = ep.eventTimestampUsec || "0";
        const timestampMs = Math.floor(parseInt(timestampUsec) / 1000);

        // Normalize IDs (remove braces)
        const cleanId = (id: string) => {
            if (!id) return "";
            return typeof id === 'string' ? id.replace(/[{}]/g, "") : id;
        };

        // Normalize types
        let type = ep.eventType || "unknown";
        // Map v3 types to v4 types where they differ substantially in naming convention
        if (type === "serverStartEvent") type = "serverStarted";
        if (type === "serverFailureEvent") type = "serverFailure";
        if (type.includes("camera") && type.includes("Disconnect")) type = "cameraDisconnectEvent";

        const businessRuleId = cleanId(event.businessRuleId || "");
        const serverId = cleanId(ep.sourceServerId || ep.eventResourceId || "");

        // In v3, the sourceName is often not directly in a top-level field but in eventParams
        const sourceName = ep.resourceName || "";

        // v3 actionType to v4 actionType
        let actionType = event.actionType || "unknown";
        if (actionType === "sendMailAction") actionType = "sendEmail";
        if (actionType === "showPopupAction") actionType = "showPopup";
        if (actionType === "pushNotificationAction") actionType = "pushNotification";

        return {
            timestampMs: timestampMs,
            eventData: {
                reason: ep.reasonCode || "none",
                serverId: serverId,
                state: "instant",
                timestamp: timestampUsec,
                type: type,
            },
            actionData: {
                acknowledge: false,
                attributes: ep.attributes || [],
                caption: ep.caption || ap.sayText || (type === "serverStarted" ? "Server Started" : ""),
                clientAction: "",
                customIcon: "",
                description: ep.description || ap.text || "",
                deviceIds: (ap.additionalResources || []).map(cleanId),
                extendedCaption: "",
                icon: "",
                id: businessRuleId,
                interval: "0",
                level: ep.metadata?.level || "info",
                objectTrackId: ep.objectTrackId || "",
                objectTypeId: "",
                originPeerId: serverId,
                ruleId: businessRuleId,
                serverId: serverId,
                sourceName: sourceName,
                state: "instant",
                timestamp: timestampUsec,
                tooltip: "",
                type: actionType,
                url: ap.url || "",
                users: {
                    all: ap.allUsers || false,
                    ids: (ap.additionalResources || []).map(cleanId),
                },
            },
            aggregatedInfo: {
                total: event.aggregationCount || 1,
                firstEventsData: [],
                lastEventsData: [],
            },
            ruleId: businessRuleId,
            flags: "noFlags",
        };
    }

    return event;
}

/**
 * Normalizes an array of events
 */
export function normalizeNxEvents(events: any[]): any[] {
    if (!Array.isArray(events)) return [];
    return events.map(normalizeNxEvent);
}
