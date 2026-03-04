/**
 * Utility to normalize Nx Witness events from different API versions
 * Specifically handles v3 (older) and v4 (newer) formats
 */

export function normalizeNxEvent(event: any): any {
    // If it's already v4 format (has eventData)
    if (event.eventData && event.actionData) {
        // Fix level for known important events that might be incorrectly reported as 'info'
        if (event.actionData.level === "info") {
            const warningTypes = ["serverConflictEvent", "serverFailureEvent", "storageFailureEvent", "networkIssueEvent"];
            if (warningTypes.includes(event.eventData.type)) {
                return {
                    ...event,
                    actionData: {
                        ...event.actionData,
                        level: "warning"
                    }
                };
            }
        }
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

        // Determine level if missing or 'info' for critical events
        let level = ep.metadata?.level || "info";
        if (level === "info") {
            const warningTypes = ["serverConflictEvent", "serverFailureEvent", "storageFailureEvent", "networkIssueEvent"];
            if (warningTypes.includes(type)) {
                level = "warning";
            }
        }

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
                level: level,
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
export function normalizeNxEvents(data: any): any[] {
    const events = Array.isArray(data) ? data : (data?.reply || []);
    return events.map(normalizeNxEvent);
}

/**
 * Normalizes a server object from v3/v4 format
 */
export function normalizeNxServer(server: any): any {
    if (!server) return null;

    // Normalize IDs (remove braces)
    const cleanId = (id: string) => {
        if (!id) return "";
        return typeof id === 'string' ? id.replace(/[{}]/g, "") : id;
    };

    // Extract basic info
    const id = cleanId(server.id || "");
    const name = server.name || "";
    // v3 uses 'status', v4 might also use 'status' or it might be in 'parameters'
    const status = server.status || "Online";

    // Extract IP from endpoints if 'ip' field is missing (common in v3)
    let ip = server.ip || "";
    if (!ip && server.endpoints && server.endpoints.length > 0) {
        // Find first non-IPv6 endpoint that looks like an IP
        const endpoint = server.endpoints.find((e: string) => !e.includes('[') && !e.startsWith(':'));
        if (endpoint) {
            ip = endpoint.split(':')[0];
        } else {
            ip = server.endpoints[0].split(':')[0].replace(/[\[\]]/g, "");
        }
    }

    return {
        ...server,
        id,
        name,
        status,
        ip,
        version: server.version || server.parameters?.version || server.osInfo?.variantVersion || "",
    };
}

/**
 * Normalizes an array of servers
 */
export function normalizeNxServers(data: any): any[] {
    const servers = Array.isArray(data) ? data : (data?.reply || []);
    return servers.map(normalizeNxServer);
}

/**
 * Normalizes a device (camera) object from v3/v4 format
 */
export function normalizeNxDevice(device: any): any {
    if (!device) return null;

    // Normalize IDs (remove braces)
    const cleanId = (id: string) => {
        if (!id) return "";
        return typeof id === 'string' ? id.replace(/[{}]/g, "").toLowerCase() : id;
    };

    const id = cleanId(device.id || "");
    const serverId = cleanId(device.serverId || device.parentId || "");

    // Extract IP from URL if missing
    let ip = device.ip || "";
    if (!ip && device.url) {
        try {
            const url = new URL(device.url);
            ip = url.hostname;
        } catch {
            // Fallback: simple regex for IP/hostname in URL
            const match = device.url.match(/:\/\/([^\/:]+)/);
            if (match) ip = match[1];
        }
    }

    return {
        ...device,
        id,
        serverId,
        ip,
        status: device.status || "Offline",
    };
}

/**
 * Normalizes an array of devices
 */
export function normalizeNxDevices(data: any): any[] {
    const devices = Array.isArray(data) ? data : (data?.reply || []);
    return devices.map(normalizeNxDevice);
}
