import { UserPublic, Role } from "./types";

/**
 * Check if the user has an administrator role.
 * Handles both old string-based roles and new object-based roles.
 */
export function isAdmin(user: UserPublic | null | undefined): boolean {
    if (!user) return false;

    const role = user.role;

    if (!role) return false;

    // Handle string role
    if (typeof role === 'string') {
        const roleName = role.toLowerCase();
        return roleName === 'admin' || roleName === 'security admin';
    }

    // Handle object role
    if (typeof role === 'object' && role !== null) {
        const roleName = role.name.toLowerCase();
        return roleName === 'admin' || roleName === 'security admin';
    }

    return false;
}
