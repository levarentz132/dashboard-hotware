import { API_CONFIG, CLOUD_CONFIG } from "./config";

/**
 * Performs the two-step login process required for admin access:
 * 1. Cloud auto-login (if enabled)
 * 2. Admin user login (using NEXT_PUBLIC_NX_USERNAME)
 * 
 * @param systemId The NX Witness System ID
 * @returns Promise<boolean> Success status
 */
export async function performAdminLogin(systemId: string): Promise<boolean> {
    if (!systemId) return false;

    try {
        // Step 1: Admin login (using NEXT_PUBLIC_NX_USERNAME)
        if (API_CONFIG.username && API_CONFIG.password) {
            console.log(`[Admin Authentication] Step 1: Admin login for ${systemId} using ${API_CONFIG.username}...`);
            const adminResponse = await fetch("/api/cloud/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemId,
                    username: API_CONFIG.username,
                    password: API_CONFIG.password,
                }),
            });

            if (adminResponse.ok) {
                console.log(`[Admin Authentication] Admin login successful for ${systemId}`);
                return true;
            } else {
                const errorData = await adminResponse.json();
                console.warn(`[Admin Authentication] Admin login failed for ${systemId}:`, errorData.error, "proceeding to cloud login...");
            }
        } else {
            console.warn("[Admin Authentication] Admin credentials (NEXT_PUBLIC_NX_USERNAME) not configured");
        }

        // Step 2: Cloud login (if possible)
        // Skip if Cloud credentials are identical to Admin credentials to avoid redundant failing calls
        const isIdentical = CLOUD_CONFIG.username === API_CONFIG.username && CLOUD_CONFIG.password === API_CONFIG.password;

        if (CLOUD_CONFIG.autoLoginEnabled && CLOUD_CONFIG.username && CLOUD_CONFIG.password && !isIdentical) {
            console.log(`[Admin Authentication] Step 2: Cloud login for ${systemId}...`);
            const cloudResponse = await fetch("/api/cloud/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemId,
                    username: CLOUD_CONFIG.username,
                    password: CLOUD_CONFIG.password,
                }),
            });

            if (cloudResponse.ok) {
                console.log(`[Admin Authentication] Cloud login successful for ${systemId}`);
                return true;
            } else {
                console.error(`[Admin Authentication] Cloud login failed for ${systemId} (Status ${cloudResponse.status})`);
            }
        }

        return false;
    } catch (error) {
        console.error(`[Admin Authentication] Error during login for ${systemId}:`, error);
        return false;
    }
}
