import { UserPublic, Role } from "./types";

/**
 * Check if the user has an administrator role.
 * Handles both old string-based roles and new object-based roles.
 */
export function isAdmin(user: UserPublic | null | undefined): boolean {
    if (!user) return false;

    // 1. Check VMS permissions string if available (New logic)
    if (user.vmsPermissions) {
        const perms = user.vmsPermissions.toLowerCase();
        if (perms.includes('administrator') || perms.includes('poweruser')) {
            return true;
        }
    }

    const role = user.role;
    if (!role) return false;

    const roleName = (typeof role === 'string' ? role : role.name).toLowerCase();
    // Both 'admin', 'security admin', and 'poweruser' are treated as administrators
    return roleName === 'admin' || roleName === 'security admin' || roleName === 'poweruser';
}

/**
 * Check if the user is strictly an administrator in the VMS.
 * This does NOT fall back to dashboard roles.
 */
export function isVmsAdmin(user: UserPublic | null | undefined): boolean {
    if (!user || !user.vmsPermissions) return false;
    const perms = user.vmsPermissions.toLowerCase();
    if (perms === "none" || perms === "") return false;
    return perms.includes('administrator') || perms.includes('poweruser');
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

/**
 * Check if a user has view permission for a specific camera.
 */
export function hasCameraViewPermission(user: UserPublic | null | undefined, cameraId: string): boolean {
    if (!user) return false;
    
    // 1. Admin/Power User bypass
    if (isAdmin(user)) return true;
    
    const normalizeId = (id: string) => id.replace(/[{}]/g, "");
    const nid = normalizeId(cameraId);

    // 1. Check VMS Resource Access Rights if available
    if (user.vmsResourceAccessRights) {
        const rights = user.vmsResourceAccessRights[nid] || user.vmsResourceAccessRights[cameraId] || "";
        if (rights && rights !== "none") {
            // Must have 'view' right
            return rights.toLowerCase().includes('view');
        }
        // If it's explicitly in the map but empty/none, return false
        if (user.vmsResourceAccessRights[nid] !== undefined || user.vmsResourceAccessRights[cameraId] !== undefined) {
            return false;
        }
    }
    
    // If the user is an admin in the dashboard, they might have legacy access
    // but the instruction is to use resource access rights only.
    // However, we keep the fallback to user.resourceAccessRights for backward compatibility
    // if vmsResourceAccessRights is not yet loaded.
    
    const rights = user.resourceAccessRights || {};
    
    // Check for both original and normalized IDs in the rights map
    const userRights = rights[nid] || rights[cameraId] || "";
    const hasRight = userRights !== "" && userRights !== "none";
    
    return hasRight;
}

/**
 * Check if a user has edit permission for a specific camera.
 */
export function hasCameraEditPermission(user: UserPublic | null | undefined, cameraId: string): boolean {
    if (!user) return false;
    
    // 1. Admin/Power User bypass
    if (isAdmin(user)) return true;
    
    const normalizeId = (id: string) => id.replace(/[{}]/g, "");
    const nid = normalizeId(cameraId);

    // 1. Check VMS Resource Access Rights if available
    if (user.vmsResourceAccessRights) {
        const rights = user.vmsResourceAccessRights[nid] || user.vmsResourceAccessRights[cameraId] || "";
        if (rights && rights !== "none") {
            // Must have 'edit' right
            return rights.toLowerCase().includes('edit');
        }
        // If it's explicitly in the map but empty/none, return false
        if (user.vmsResourceAccessRights[nid] !== undefined || user.vmsResourceAccessRights[cameraId] !== undefined) {
            return false;
        }
    }
    
    const rights = user.resourceAccessRights || {};
    
    const userRights = (rights[nid] || rights[cameraId] || "").toLowerCase();
    const allowed = userRights !== "" && userRights !== "none";
    return allowed;
}
