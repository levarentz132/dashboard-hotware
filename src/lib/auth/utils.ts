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
export function getCameraRights(
    user: UserPublic | null | undefined,
    cameraId: string,
    accessibleCameraIds?: Set<string>,
): string {
    if (!user) return "";

    const normalizeId = (id: string) => id.replace(/[{}]/g, "");
    const nid = normalizeId(cameraId);
    const lowerId = nid.toLowerCase();

    const lookupRights = (rightsMap: Record<string, string> | undefined): string => {
        if (!rightsMap) return "";
        if (rightsMap[nid]) return rightsMap[nid];
        if (rightsMap[cameraId]) return rightsMap[cameraId];
        for (const [key, value] of Object.entries(rightsMap)) {
            if (normalizeId(key).toLowerCase() === lowerId) {
                return value;
            }
        }
        return "";
    };

    if (user.vmsResourceAccessRights) {
        const rights = lookupRights(user.vmsResourceAccessRights);
        if (rights && rights !== "none") {
            return rights;
        }
        const hasExplicitDeny = Object.keys(user.vmsResourceAccessRights).some(
            (key) => normalizeId(key).toLowerCase() === lowerId,
        );
        if (hasExplicitDeny) {
            return "none";
        }
    }

    const legacyRights = lookupRights(user.resourceAccessRights);
    if (legacyRights && legacyRights !== "none") {
        return legacyRights;
    }

    if (accessibleCameraIds?.has(lowerId) || accessibleCameraIds?.has(nid)) {
        return "view";
    }

    return "";
}

export function hasCameraViewPermission(
    user: UserPublic | null | undefined,
    cameraId: string,
    accessibleCameraIds?: Set<string>,
): boolean {
    if (!user) return false;

    // Admin/Power User bypass
    if (isAdmin(user)) return true;

    const rights = getCameraRights(user, cameraId, accessibleCameraIds).toLowerCase();
    return rights !== "" && rights !== "none" && rights.includes("view");
}

/**
 * Check if a user can see a schedule (any creator) on a camera they can view.
 */
export function canViewSchedule(
    user: UserPublic | null | undefined,
    schedule: { cameraId: string },
    accessibleCameraIds?: Set<string>,
): boolean {
    if (!user) return false;
    if (isAdmin(user)) return true;
    return hasCameraViewPermission(user, schedule.cameraId, accessibleCameraIds);
}

/**
 * Check if a user can create, edit, or delete a schedule entry.
 * VMS power users / administrators may manage any schedule; others only their own.
 */
export function canManageSchedule(
    user: UserPublic | null | undefined,
    schedule: { scheduledBy?: string }
): boolean {
    if (!user) return false;
    if (isAdmin(user)) return true;

    const owner = schedule.scheduledBy?.trim();
    const username = user.username?.trim();
    if (!owner || !username || owner === "System" || owner === "Verifying...") {
        return false;
    }

    return owner.toLowerCase() === username.toLowerCase();
}

/**
 * Check if a user has edit permission for a specific camera.
 */
export function hasCameraEditPermission(
    user: UserPublic | null | undefined,
    cameraId: string,
    accessibleCameraIds?: Set<string>,
): boolean {
    if (!user) return false;
    
    // 1. Admin/Power User bypass
    if (isAdmin(user)) return true;

    const rights = getCameraRights(user, cameraId, accessibleCameraIds).toLowerCase();
    return rights !== "" && rights !== "none" && rights.includes("edit");
}
