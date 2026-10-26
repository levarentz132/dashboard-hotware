/**
 * Next.js Server Lifecycle Instrumentation
 * Automatically executes once upon Node.js server startup.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const path = await import("path");
      const dotenv = await import("dotenv");
      dotenv.config({ path: path.join(process.cwd(), ".env.local") });
      dotenv.config({ path: path.join(process.cwd(), ".env") });

      const { startDeviceWatchdog } = await import("@/lib/device-watchdog");
      startDeviceWatchdog(30000); // Check all cameras every 30 seconds
    } catch (err) {
      console.error("[Instrumentation] Failed to start device watchdog:", err);
    }
  }
}
