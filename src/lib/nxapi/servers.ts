import { API_ENDPOINTS } from "../config";
import logger from "../logger";
import { NxCameraService } from "./cameras";
import { NxSystemInfo } from "./types";

export class NxServerService extends NxCameraService {
  // System methods
  async getSystemInfo(options?: { skipCache?: boolean }): Promise<NxSystemInfo | null> {
    try {
      const info = await this.apiRequest<NxSystemInfo>("/system/info", options);
      return info;
    } catch (error) {
      return null; // Return null when API is unavailable
    }
  }

  // Server methods (REST v3)
  async getServers(options?: { skipCache?: boolean }): Promise<any> {
    try {
      const servers = await this.apiRequest<any>("/servers", options);

      if (Array.isArray(servers)) {
        return servers;
      } else if (servers && typeof servers === "object" && servers.servers) {
        return servers.servers;
      } else {
        console.warn("[getServers] Unexpected servers response format:", servers);
        logger.debug("[getServers] Available keys:", servers ? Object.keys(servers) : "null/undefined");
        return [];
      }
    } catch (error) {
      console.error("[getServers] Error in getServers:", error);
      throw error;
    }
  }

  async getServerInfo(serverId: string): Promise<any> {
    const endpoint = API_ENDPOINTS.serverInfo.replace("{id}", serverId);
    const info = await this.apiRequest<any>(endpoint);
    return info === null ? null : info;
  }

  // Get server status for API status widget
  async getServerStatus(): Promise<{ connected: boolean; serverCount: number; lastUpdate: string }> {
    try {
      const servers = await this.getServers();
      return {
        connected: Array.isArray(servers) && servers.length > 0,
        serverCount: Array.isArray(servers) ? servers.length : 0,
        lastUpdate: new Date().toLocaleTimeString(),
      };
    } catch (error) {
      return {
        connected: false,
        serverCount: 0,
        lastUpdate: new Date().toLocaleTimeString(),
      };
    }
  }

  async getModuleInformation(): Promise<any> {
    const modules = await this.apiRequest<any>(API_ENDPOINTS.moduleInformation);
    if (modules === null) {
      return { modules: [], success: false };
    }
    return modules;
  }
}
