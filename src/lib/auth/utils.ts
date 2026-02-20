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
