import { API_ENDPOINTS } from "../config";
import logger from "../logger";
import { NxEvent, NxMetricsAlarm, NxMetricsAlarmsResponse } from "./types";
import { NxUserService } from "./users";

export class NxStorageService extends NxUserService {
  // Events methods
  async getEvents(limit: number = 50): Promise<NxEvent[]> {
    try {
      const events = await this.apiRequest<NxEvent[]>(`${API_ENDPOINTS.events}?limit=${limit}`);
      return events || [];
    } catch (error) {
      console.error("[getEvents] Error fetching events:", error);
      return [];
    }
  }

  async createGenericEvent(payload: {
    timestamp?: string;
    state?: string;
    source?: string;
    caption?: string;
    description?: string;
    deviceIds?: string[];
    level?: string;
  }): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (payload.timestamp) params.set("timestamp", payload.timestamp);
      if (payload.caption) params.set("caption", payload.caption);
      if (payload.description) params.set("description", payload.description);
      if (payload.source) params.set("source", payload.source);
      if (payload.state) params.set("state", payload.state);

      return await this.apiRequest(`/api/createEvent?${params.toString()}`, {
        method: "GET",
      });
    } catch (error) {
      const errorMsg = String(error);
      const is404 = errorMsg.includes('404') || errorMsg.includes('Not Found');

      if (is404) {
        console.debug("[createGenericEvent] Server does not support generic events API");
      } else {
        console.error("[createGenericEvent] Request failed:", error);
      }
      throw error;
    }
  }

  // Alarms methods (from metrics endpoint)
  async getAlarms(): Promise<NxEvent[]> {
    try {
      const alarms = await this.apiRequest<NxMetricsAlarmsResponse>(API_ENDPOINTS.metricsAlarms);

      const events: NxEvent[] = [];
      if (alarms?.servers) {
        Object.entries(alarms.servers).forEach(([serverId, serverData]) => {
          const processAlarms = (alarmCategory: Record<string, NxMetricsAlarm[]> | undefined) => {
            if (alarmCategory) {
              Object.entries(alarmCategory).forEach(([type, alarmList]) => {
                alarmList.forEach((alarm, index) => {
                  events.push({
                    id: `${serverId}-${type}-${index}`,
                    timestamp: alarm.timestamp || new Date().toISOString(),
                    cameraId: alarm.deviceId || "",
                    type: alarm.level || type,
                    description: alarm.text || alarm.message || alarm.caption || "Unknown alarm",
                    metadata: alarm,
                  });
                });
              });
            }
          };

          processAlarms(serverData?.info);
          processAlarms(serverData?.load);
        });
      }
      return events;
    } catch (error) {
      // Quietly return empty list if server doesn't support metrics alarms
      return [];
    }
  }

  // Storage information - Get storages for a specific server
  async getStorages(serverId: string = "this"): Promise<any> {
    try {
      const endpoint = API_ENDPOINTS.storages.replace("{serverId}", serverId);
      const storages = await this.apiRequest<any>(endpoint);
      return storages === null ? [] : storages;
    } catch (error) {
      console.error("[getStorages] Storages endpoint error:", error);
      return [];
    }
  }

  // Create a new storage on a server
  async createStorage(
    serverId: string,
    storageData: {
      name: string;
      path: string;
      type: string;
      spaceLimitB?: number;
      isUsedForWriting?: boolean;
      isBackup?: boolean;
      parameters?: Record<string, any>;
    },
  ): Promise<any> {
    try {
      const endpoint = API_ENDPOINTS.createStorage(serverId);

      const body = {
        name: storageData.name,
        path: storageData.path,
        type: storageData.type,
        spaceLimitB: storageData.spaceLimitB || 0,
        isUsedForWriting: storageData.isUsedForWriting !== false,
        isBackup: storageData.isBackup || false,
        status: "Offline",
        parameters: storageData.parameters || {},
      };

      const response = await this.apiRequest<any>(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return response;
    } catch (error) {
      console.error("[createStorage] Failed to create storage:", error);
      throw error;
    }
  }

  // Get a specific storage by ID
  async getStorageById(serverId: string, storageId: string): Promise<any> {
    try {
      const endpoint = API_ENDPOINTS.storageById(serverId, storageId);
      const response = await this.apiRequest<any>(endpoint);
      return response;
    } catch (error) {
      console.error("[getStorageById] Failed to get storage:", error);
      throw error;
    }
  }

  // Update/modify an existing storage
  async updateStorage(
    serverId: string,
    storageId: string,
    updateData: {
      name?: string;
      path?: string;
      type?: string;
      spaceLimitB?: number;
      isUsedForWriting?: boolean;
      isBackup?: boolean;
      status?: string;
      parameters?: Record<string, any>;
    },
  ): Promise<any> {
    try {
      const endpoint = API_ENDPOINTS.updateStorage(serverId, storageId);

      const response = await this.apiRequest<any>(endpoint, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      return response;
    } catch (error) {
      console.error("[updateStorage] Failed to update storage:", error);
      throw error;
    }
  }

  // Delete a storage
  async deleteStorage(serverId: string, storageId: string): Promise<boolean> {
    try {
      const endpoint = API_ENDPOINTS.deleteStorage(serverId, storageId);

      await this.apiRequest<any>(endpoint, {
        method: "DELETE",
      });

      return true;
    } catch (error) {
      console.error("[deleteStorage] Failed to delete storage:", error);
      throw error;
    }
  }

  // Get storage info (legacy method for compatibility)
  async getStorageInfo(): Promise<any> {
    try {
      const storages = await this.getStorages("this");
      return storages;
    } catch (error) {
      logger.debug("[getStorageInfo] Storage endpoint not available:", error);
      return null;
    }
  }

  // Get all storage data across all servers
  async getAllStorageData(): Promise<any> {
    try {
      const servers = await this.getServers();

      const storageData: {
        servers: Array<{
          serverId: string;
          serverName: string;
          storages: any[];
        }>;
        totalCapacity: number;
        usedSpace: number;
        freeSpace: number;
      } = {
        servers: [],
        totalCapacity: 0,
        usedSpace: 0,
        freeSpace: 0,
      };

      if (Array.isArray(servers) && servers.length > 0) {
        for (const server of servers) {
          const storages = await this.getStorages(server.id);
          if (Array.isArray(storages) && storages.length > 0) {
            storageData.servers.push({
              serverId: server.id,
              serverName: server.name,
              storages: storages,
            });
          }
        }
      } else {
        const storages = await this.getStorages("this");
        if (Array.isArray(storages) && storages.length > 0) {
          storageData.servers.push({
            serverId: "this",
            serverName: "Current Server",
            storages: storages,
          });
        }
      }

      return storageData;
    } catch (error) {
      console.error("[getAllStorageData] Error fetching storage data:", error);
      return null;
    }
  }
}
