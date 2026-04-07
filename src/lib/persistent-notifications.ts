import Cookies from "js-cookie";

export interface PersistentNotification {
    id: string;
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
    systemId?: string;
    deviceId?: string;
    startTimeMs?: number;
    endTimeMs?: number;
    durationMs?: number;
    timestamp: number;
    read: boolean;
}

/**
 * Get the current username to use as a key for notifications
 */
export function getNotificationUserKey(): string | null {
    // 1. Check for logged in cloud session email/username
    const cloudSession = Cookies.get("nx_cloud_session");
    if (cloudSession) {
        try {
            const parsed = JSON.parse(cloudSession);
            if (parsed.email) return parsed.email;
        } catch (e) {}
    }

    // 2. Check for local user cookie
    const localUser = Cookies.get("local_nx_user");
    if (localUser) return localUser;

    // 3. Last resort - check process.env for static config in Electron
    // @ts-ignore
    const extConfig = typeof window !== 'undefined' ? (window as any).electronConfig : null;
    if (extConfig?.NEXT_PUBLIC_NX_CLOUD_USERNAME) return extConfig.NEXT_PUBLIC_NX_CLOUD_USERNAME;
    if (extConfig?.NEXT_PUBLIC_NX_USERNAME) return extConfig.NEXT_PUBLIC_NX_USERNAME;

    return null;
}

/**
 * Send a notification to the persistent storage
 */
export async function addPersistentNotification(notification: {
    type: 'success' | 'info' | 'warning' | 'error';
    title: string;
    message: string;
    systemId?: string;
    deviceId?: string;
    startTimeMs?: number;
    endTimeMs?: number;
    durationMs?: number;
}) {
    const username = getNotificationUserKey();
    if (!username) {
        console.warn("[Notifications] No username found, skipping persistent notification");
        return;
    }

    try {
        await fetch("/api/notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                ...notification,
                timestamp: Date.now()
            })
        });
        
        // Dispatch event for UI updates
        window.dispatchEvent(new CustomEvent('nx:notifications-updated'));
    } catch (e) {
        console.error("[Notifications] Failed to add persistent notification:", e);
    }
}

/**
 * Fetch notifications for the current user
 */
export async function getPersistentNotifications(): Promise<PersistentNotification[]> {
    const username = getNotificationUserKey();
    if (!username) return [];

    try {
        const res = await fetch(`/api/notifications?username=${encodeURIComponent(username)}`);
        if (res.ok) {
            const data = await res.json();
            return data.notifications || [];
        }
    } catch (e) {
        console.error("[Notifications] Failed to fetch notifications:", e);
    }
    return [];
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(id: string) {
    const username = getNotificationUserKey();
    if (!username) return;

    try {
        await fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, id, read: true })
        });
        window.dispatchEvent(new CustomEvent('nx:notifications-updated'));
    } catch (e) {}
}

/**
 * Delete a notification
 */
export async function deleteNotification(id: string) {
    const username = getNotificationUserKey();
    if (!username) return;

    try {
        await fetch(`/api/notifications?username=${encodeURIComponent(username)}&id=${id}`, {
            method: "DELETE"
        });
        window.dispatchEvent(new CustomEvent('nx:notifications-updated'));
    } catch (e) {}
}

/**
 * Clear all notifications
 */
export async function clearAllNotifications() {
    const username = getNotificationUserKey();
    if (!username) return;

    try {
        await fetch(`/api/notifications?username=${encodeURIComponent(username)}&clearAll=true`, {
            method: "DELETE"
        });
        window.dispatchEvent(new CustomEvent('nx:notifications-updated'));
    } catch (e) {}
}
