import { UserPublic, Role } from "./types";

/**
 * Check if the user has an administrator role.
 * Handles both old string-based roles and new object-based roles.
 */
export function isAdmin(user: UserPublic | null | undefined): boolean {
    if (!user) return false;

    const role = user.role;
    if (!role) return false;

    const roleName = (typeof role === 'string' ? role : role.name).toLowerCase();
    // Both 'admin' and 'security admin' are treated as administrators
    return roleName === 'admin' || roleName === 'security admin';
}

/**
 * Get the standardized role name for display.
 * Maps 'security admin' to 'Admin'.
 */
export function getDisplayRole(role: string | Role | null | undefined): string {
    if (!role) return "User";

    const roleName = (typeof role === 'string' ? role : role.name);
    if (roleName.toLowerCase() === 'security admin') return 'Admin';
    if (roleName.toLowerCase() === 'admin') return 'Admin';

    return roleName;
}

/**
 * Check if the license is expired.
 * @param license_expires_at The expiration date string
 */
export function isLicenseExpired(license_expires_at: string | null | undefined): boolean {
    if (!license_expires_at) return false;
    try {
        const expiry = new Date(license_expires_at);
        // Invalid date check
        if (isNaN(expiry.getTime())) return false;
        return expiry < new Date();
    } catch (e) {
        return false;
    }
}

/**
 * Check if the license is expiring within a certain number of days.
 * @param license_expires_at The expiration date string
 * @param days Threshold in days
 */
export function isLicenseExpiringSoon(license_expires_at: string | null | undefined, days: number = 7): boolean {
    if (!license_expires_at) return false;
    try {
        const expiry = new Date(license_expires_at);
        // Invalid date check
        if (isNaN(expiry.getTime())) return false;
        
        const now = new Date();
        const soon = new Date();
        soon.setDate(now.getDate() + days);
        
        return expiry < soon && expiry > now;
    } catch (e) {
        return false;
    }
}

/**
 * Format a date string to Indonesian locale (id-ID).
 * @param dateString The date string to format
 * @returns Formatted date string or the original if invalid
 */
export function formatIndonesianDate(dateString: string | null | undefined): string {
    if (!dateString) return "-";
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        return new Intl.DateTimeFormat('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(date);
    } catch (e) {
        return dateString;
    }
}
