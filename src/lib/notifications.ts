/**
 * Simple global event-based notification system
 */

export interface ToastNotificationPayload {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
}

const NOTIFICATION_EVENT_NAME = 'hotware-notification';

/**
 * Trigger a global toast notification
 */
export function showNotification(payload: ToastNotificationPayload) {
    if (typeof window !== 'undefined') {
        const event = new CustomEvent(NOTIFICATION_EVENT_NAME, { detail: payload });
        window.dispatchEvent(event);
    }
}

export { NOTIFICATION_EVENT_NAME };
