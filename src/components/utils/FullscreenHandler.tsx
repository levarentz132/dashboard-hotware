"use client";

import { useEffect } from "react";

/**
 * Handles global fullscreen behavior for the web app.
 * Note: Most browsers block auto-fullscreen unless triggered by a user action.
 */
export function FullscreenHandler() {
    useEffect(() => {
        const attemptFullscreen = async () => {
            // Small delay to ensure browser interaction window or Electron shell is ready
            await new Promise(resolve => setTimeout(resolve, 800));

            try {
                if (!document.fullscreenElement) {
                    // This will likely fail in regular browsers without user interaction
                    // but works reliably in Electron's main process or if triggered by splash
                    await document.documentElement.requestFullscreen();
                }
            } catch (err) {
                // Silently fail as this is an 'attempt'
            }
        };

        attemptFullscreen();
    }, []);

    return null;
}
