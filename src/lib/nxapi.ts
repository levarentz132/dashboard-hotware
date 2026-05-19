import { API_CONFIG } from "./config";
import { NxStorageService } from "./nxapi/storage";
export type {
  NxCamera,
  NxEvent,
  NxMetricsAlarm,
  NxMetricsAlarmsResponse,
  NxSystemInfo,
} from "./nxapi/types";

class NxWitnessAPI extends NxStorageService {}
export const nxAPI = new NxWitnessAPI();

if (typeof window !== "undefined" && API_CONFIG.username && API_CONFIG.password) {
  setTimeout(async () => {
    try {
      const success = await nxAPI.login(API_CONFIG.username!, API_CONFIG.password!);

      if (success) {
        await Promise.allSettled([nxAPI.getCameras(), nxAPI.getSystemInfo(), nxAPI.getServers()]);
      }
    } catch (error) {
      console.error("[nxAPI] Auto-login failed:", error);
    }
  }, 1500);
}

export default nxAPI;
