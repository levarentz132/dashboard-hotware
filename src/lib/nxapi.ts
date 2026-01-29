import { ICamera, IDeviceType } from "@/types/Device";
import { API_CONFIG, API_ENDPOINTS } from "./config";
import { IServer } from "@/types/Server";

export interface NxCamera {
  id: string;
  name: string;
  physicalId: string;
  url?: string;
  status: "Online" | "Offline" | "Unauthorized" | "Recording" | "online" | "offline";
  typeId: string;
  model?: string;
  vendor?: string;
  mac?: string;
  ip?: string;
  port?: number;
  // Additional properties that may come from Nx Witness
  location?: string;
  type?: string;
  resolution?: string;
  fps?: number;
  lastSeen?: string;
  recordingStatus?: string;
  serverId: string;
  isManuallyAdded?: boolean;
  group?: {
    id?: string;
    name?: string;
  };
  credentials: {
    user: string;
    password: string;
  };
  logicalId?: string;
}

export interface NxEvent {
  id: string;
  timestamp: string;
  cameraId: string;
  type: string;
  description: string;
  metadata?: Record<string, any>;
}

// Metrics alarm item from /rest/v3/system/metrics/alarms
export interface NxMetricsAlarm {
  level?: string; // "warning", "error", "critical"
  text?: string;
  message?: string;
  caption?: string;
  timestamp?: string;
  deviceId?: string;
  serverId?: string;
  [key: string]: any; // Allow additional fields
}

// Response structure for metrics alarms endpoint
export interface NxMetricsAlarmsResponse {
  servers: {
    [serverId: string]: {
      info?: {
        [alarmType: string]: NxMetricsAlarm[];
      };
      load?: {
        [alarmType: string]: NxMetricsAlarm[];
      };
    };
  };
}

export interface NxSystemInfo {
  name: string;
  customization: string;
  version: string;
  protoVersion: number;
  restApiVersions: {
    min: string;
    max: string;
  };
  cloudHost: string;
  localId: string;
  cloudId?: string;
  cloudOwnerId?: string;
  organizationId?: string;
  servers: string[];
  edgeServerCount: number;
  devices: string[];
  ldapSyncId?: string;
  synchronizedTimeMs?: number;
}

class NxWitnessAPI {
  private baseURL: string;
  private authToken: string | null = null;
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private pendingRequests: Map<string, Promise<any>> = new Map();
  private readonly CACHE_TTL = 10000; // 10 seconds cache

  constructor() {
    this.baseURL = API_CONFIG.baseURL;
  }

  // Authentication - Nx Witness REST API v3
  async login(username: string, password: string): Promise<boolean> {
    try {
      // Check if server is available first
      const isAvailable = await this.isApiAvailable();
      if (!isAvailable) {
        return false;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new Error("Login timeout after 8 seconds")), 8000);

      // Nx Witness REST API v3 login format
      const loginBody = {
        username: username,
        password: password,
        setCookie: true,
      };

      const response = await fetch(`${this.baseURL}${API_ENDPOINTS.login}`, {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(loginBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        // Nx Witness sets session cookie automatically
        // No need to handle tokens manually
        // Login successful
        return true;
      } else {
        console.error("[nxAPI] Login failed:", response.status, response.statusText);
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  // Get request headers without auth (Nx Witness uses cookies)
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  // Check if Nx Witness API is available
  private async isApiAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error("API availability check timeout")), 5000);

      // Test system info endpoint through proxy
      const response = await fetch(`${this.baseURL}/system/info`, {
        method: "GET",
        credentials: "include",
        signal: controller.signal,
        headers: this.getHeaders(),
      });

      // Accept any non-server-error response (including 401 Unauthorized which is expected)
      if (response.status < 500 || response.status === 401 || response.status === 403) {
        // Server available
        return true;
      }

      console.warn("[nxAPI] Server returned error status:", response.status);
      return false;
    } catch (error) {
      console.error("[nxAPI] Server availability check failed:", error);
      return false;
    }
  }

  // Generic API request with deduplication and caching
  private async apiRequest<T>(endpoint: string, options: RequestInit & { skipCache?: boolean } = {}): Promise<T> {
    const cacheKey = `${options.method || "GET"}:${endpoint}`;
    const { skipCache = false, ...fetchOptions } = options;

    // 1. Check Cache (only for GET requests)
    if (!skipCache && (options.method === "GET" || !options.method)) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.data;
      }
    }

    // 2. Check Pending Requests (Deduplication)
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      const url = `${this.baseURL}${endpoint}`;
      const config: RequestInit = {
        credentials: "include",
        ...fetchOptions,
        headers: {
          ...this.getHeaders(),
          ...fetchOptions.headers,
        },
      };

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(new Error("Request timeout after 10 seconds")), 10000);

        const response = await fetch(url, {
          ...config,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[apiRequest ERROR] ${endpoint}: ${response.status}`, errorText);

          let errorMessage = errorText;
          try {
            const errorObj = JSON.parse(errorText);
            if (errorObj.errorString) {
              errorMessage = errorObj.errorString;
            } else if (errorObj.message) {
              errorMessage = errorObj.message;
            }
          } catch (e) {
            // Not JSON or missing expected fields
          }

          throw new Error(`HTTP_${response.status}: ${errorMessage}`);
        }

        if (response.status === 204 || response.headers.get("content-length") === "0") {
          return undefined as unknown as T;
        }

        const contentType = response.headers.get("content-type");
        let result: T;
        if (contentType && contentType.includes("application/json")) {
          const text = await response.text();
          result = (!text || text.trim() === "") ? (undefined as unknown as T) : JSON.parse(text);
        } else {
          result = (await response.text()) as unknown as T;
        }

        // Save to cache for GET requests
        if (options.method === "GET" || !options.method) {
          this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
        }

        return result;
      } catch (error) {
        console.error(`[apiRequest] ${endpoint}: Request failed:`, error);
        throw error;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    })();

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  // Camera methods
  async getCameras(): Promise<NxCamera[]> {
    const cameras = await this.apiRequest<NxCamera[]>(API_ENDPOINTS.devices);
    if (cameras === null || !Array.isArray(cameras)) {
      return []; // Return empty array when server unavailable
    }
    return cameras;
  }

  async getCameraById(id: string): Promise<NxCamera | null> {
    const camera = await this.apiRequest<NxCamera>(API_ENDPOINTS.deviceById(id));
    return camera === null ? null : camera;
  }

  async getCameraStatus(): Promise<Record<string, string>> {
    const status = await this.apiRequest<Record<string, string>>(API_ENDPOINTS.deviceStatus);
    return status === null ? {} : status;
  }

  async getDevices(): Promise<ICamera[]> {
    const devices = await this.apiRequest<ICamera[]>(API_ENDPOINTS.devices);
    return devices === null ? [] : devices;
  }

  // Device type methods
  async getDeviceTypes(): Promise<IDeviceType[]> {
    const types = await this.apiRequest<IDeviceType[]>(API_ENDPOINTS.deviceTypes);
    return types === null ? [] : types;
  }
  async addCamera(payload: Partial<ICamera> & { name: string; url: string; serverId: string }) {
    try {
      const endpoint = API_ENDPOINTS.createDevice;
      const [deviceTypes, servers] = await Promise.all([
        this.apiRequest<IDeviceType[]>(API_ENDPOINTS.deviceTypes),
        this.apiRequest<IServer[]>(API_ENDPOINTS.servers),
      ]);
      // Validasi typeId (optional field)
      if (payload.typeId) {
        const deviceType = deviceTypes.find((type) => type.id === payload.typeId);
        if (!deviceType) {
          throw new Error(
            `Device type not found: ${payload.typeId}. Available types: ${deviceTypes.map((t) => t.name).join(", ")}`
          );
        }
      }

      // Validasi serverId (required field)
      const server = servers.find((s) => s.id === payload.serverId);
      if (!server) {
        throw new Error(
          `Server not found: ${payload.serverId}. Available servers: ${servers.map((s) => s.name).join(", ")}`
        );
      }

      const body = {
        // physicalId must not be empty for NX API
        physicalId: payload.physicalId || `manual_${Date.now()}`,
        url: payload.url,
        typeId: payload.typeId,
        name: payload.name,
        mac: payload.mac,
        serverId: payload.serverId,
        isManuallyAdded: true, //harus true
        vendor: payload.vendor,
        model: payload.model,
        // Mengirim null/undefined jika group tidak ada
        group:
          payload.group?.id && payload.group?.name
            ? {
              id: payload.group.id,
              name: payload.group.name,
            }
            : undefined,
        credentials: payload.credentials
          ? {
            user: payload.credentials.user || "",
            password: payload.credentials.password || "",
          }
          : { user: "", password: "" },
        logicalId: payload.logicalId,
      };

      const response = await this.apiRequest<ICamera>(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      return response;
    } catch (error) {
      console.error("[createCamera] Failed to create camera:", error);
      throw error;
    }
  }
  async updateCamera(id: string, payload: Partial<ICamera>) {
    try {
      const endpoint = API_ENDPOINTS.modifyDevice(id);

      // Fetch reference data jika ada field yang perlu divalidasi
      const validationNeeded = payload.typeId || payload.serverId;
      let deviceTypes: IDeviceType[] = [];
      let servers: IServer[] = [];

      if (validationNeeded) {
        [deviceTypes, servers] = await Promise.all([
          payload.typeId ? this.apiRequest<IDeviceType[]>(API_ENDPOINTS.deviceTypes) : Promise.resolve([]),
          payload.serverId ? this.apiRequest<IServer[]>(API_ENDPOINTS.servers) : Promise.resolve([]),
        ]);
      }

      // Validasi typeId jika ada
      if (payload.typeId && deviceTypes.length > 0) {
        const deviceType = deviceTypes.find((type) => type.id === payload.typeId);
        if (!deviceType) {
          throw new Error(
            `Device type not found: ${payload.typeId}. Available types: ${deviceTypes.map((t) => t.name).join(", ")}`
          );
        }
      }

      // Validasi serverId jika ada
      if (payload.serverId && servers.length > 0) {
        const server = servers.find((s) => s.id === payload.serverId);
        if (!server) {
          throw new Error(
            `Server not found: ${payload.serverId}. Available servers: ${servers.map((s) => s.name).join(", ")}`
          );
        }
      }

      const body: any = {};

      if (payload.physicalId !== undefined && payload.physicalId !== "") {
        body.physicalId = payload.physicalId;
      }
      if (payload.url !== undefined) body.url = payload.url;
      if (payload.typeId !== undefined) body.typeId = payload.typeId;
      if (payload.name !== undefined) body.name = payload.name;
      if (payload.mac !== undefined) body.mac = payload.mac;
      if (payload.serverId !== undefined) body.serverId = payload.serverId;
      if (payload.vendor !== undefined) body.vendor = payload.vendor;
      if (payload.model !== undefined) body.model = payload.model;
      if (payload.logicalId !== undefined) body.logicalId = payload.logicalId;

      // Handle group
      if (payload.group !== undefined) {
        body.group =
          payload.group?.id && payload.group?.name
            ? {
              id: payload.group.id,
              name: payload.group.name,
            }
            : null;
      }

      // Handle credentials
      if (payload.credentials !== undefined) {
        body.credentials = {
          user: payload.credentials.user,
          password: payload.credentials.password,
        };
      }

      // Try PATCH first (correct method for NX Witness API)
      try {
        const response = await this.apiRequest<ICamera>(endpoint, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        return response;
      } catch (patchError) {
        // Fallback to PUT if PATCH fails
        console.log("[updateCamera] PATCH failed, trying PUT...", patchError);
        const response = await this.apiRequest<ICamera>(endpoint, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        return response;
      }
    } catch (error) {
      console.error("[updateCamera] Failed to update camera:", error);
      throw error;
    }
  }

  // Delete a camera
  async deleteCamera(id: string): Promise<boolean> {
    try {
      const endpoint = API_ENDPOINTS.deleteDevice(id);

      await this.apiRequest<void>(endpoint, {
        method: "DELETE",
      });

      return true;
    } catch (error) {
      console.error("[deleteCamera] Failed to delete camera:", error);
      throw error;
    }
  }

  // System methods
  async getSystemInfo(): Promise<NxSystemInfo | null> {
    try {
      // Use the correct REST v3 system info endpoint
      const info = await this.apiRequest<NxSystemInfo>("/system/info");
      return info;
    } catch (error) {
      return null; // Return null when API is unavailable
    }
  }

  // Server methods (REST v3)
  async getServers(): Promise<any> {
    try {
      const servers = await this.apiRequest<any>("/servers");

      // Return the servers directly as they come from the API (should be an array)
      if (Array.isArray(servers)) {
        return servers;
      } else if (servers && typeof servers === "object" && servers.servers) {
        // Handle wrapped response if API format changes
        return servers.servers;
      } else {
        console.warn("[getServers] Unexpected servers response format:", servers);
        console.log("[getServers] Available keys:", servers ? Object.keys(servers) : "null/undefined");
        return [];
      }
    } catch (error) {
      console.error("[getServers] Error in getServers:", error);
      throw error; // Let the hook handle the error
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
      return { modules: [], success: false }; // Return empty when server unavailable
    }
    return modules;
  }

  // User methods
  async getUsers(): Promise<any[]> {
    const users = await this.apiRequest<any[]>("/users");
    return Array.isArray(users) ? users : [];
  }

  async getUserById(id: string): Promise<any> {
    return await this.apiRequest<any>(`/users/${id}`);
  }

  async createUser(userData: any): Promise<any> {
    return await this.apiRequest<any>("/users", {
      method: "POST",
      body: JSON.stringify(userData),
    });
  }

  async updateUser(id: string, userData: any): Promise<any> {
    return await this.apiRequest<any>(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(userData),
    });
  }

  async deleteUser(id: string): Promise<boolean> {
    await this.apiRequest<any>(`/users/${id}`, {
      method: "DELETE",
    });
    return true;
  }

  // User Group methods
  async getUserGroups(): Promise<any[]> {
    const groups = await this.apiRequest<any[]>("/userGroups");
    return Array.isArray(groups) ? groups : [];
  }

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

  // Alarms methods (from metrics endpoint)
  async getAlarms(): Promise<NxEvent[]> {
    try {
      const alarms = await this.apiRequest<NxMetricsAlarmsResponse>(API_ENDPOINTS.metricsAlarms);

      // Convert metrics alarms to NxEvent format
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
      console.error("[getAlarms] Error fetching alarms:", error);
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
    }
  ): Promise<any> {
    try {
      const endpoint = API_ENDPOINTS.createStorage(serverId);

      const body = {
        name: storageData.name,
        path: storageData.path,
        type: storageData.type,
        spaceLimitB: storageData.spaceLimitB || 0,
        isUsedForWriting: storageData.isUsedForWriting !== false, // Default to true
        isBackup: storageData.isBackup || false,
        status: "Offline", // New storages start offline
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
    }
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

      const response = await this.apiRequest<any>(endpoint, {
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
      // Try to get storages from current server
      const storages = await this.getStorages("this");
      return storages;
    } catch (error) {
      console.log("[getStorageInfo] Storage endpoint not available:", error);
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

      // Fetch storages for each server
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
        // If no servers found, try 'this' server
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

  // Get authentication status
  isAuthenticated(): boolean {
    return !!this.authToken;
  }

  // Get current auth token (for debugging)
  getAuthToken(): string | null {
    return this.authToken;
  }

  // Logout - Delete session token
  async logout(): Promise<boolean> {
    try {
      // First, get current session info to find the token
      const sessionsResponse = await fetch(`${this.baseURL}/login/sessions`, {
        method: "GET",
        credentials: "include",
        headers: this.getHeaders(),
      });

      if (sessionsResponse.ok) {
        const sessions = await sessionsResponse.json();

        // Get the current session token (usually the first/only one)
        let token = null;
        if (Array.isArray(sessions) && sessions.length > 0) {
          token = sessions[0].token || sessions[0].id;
        } else if (sessions.token) {
          token = sessions.token;
        }

        if (token) {
          // Delete the session using the token
          const deleteResponse = await fetch(`${this.baseURL}/login/sessions/${token}`, {
            method: "DELETE",
            credentials: "include",
            headers: this.getHeaders(),
          });

          if (deleteResponse.ok || deleteResponse.status === 204) {
            this.authToken = null;
            return true;
          } else {
            console.error("[nxAPI] Failed to delete session:", deleteResponse.status);
          }
        }
      }

      // Fallback: Try to delete "current" session
      const fallbackResponse = await fetch(`${this.baseURL}/login/sessions/current`, {
        method: "DELETE",
        credentials: "include",
        headers: this.getHeaders(),
      });

      if (fallbackResponse.ok || fallbackResponse.status === 204) {
        this.authToken = null;
        // Clear auth cookie
        if (typeof document !== "undefined") {
          document.cookie = "nx-auth=; path=/; max-age=0";
        }
        return true;
      }

      // Clear local auth token anyway
      this.authToken = null;
      // Clear auth cookie
      if (typeof document !== "undefined") {
        document.cookie = "nx-auth=; path=/; max-age=0";
      }
      return true;
    } catch (error) {
      console.error("[nxAPI] Logout error:", error);
      // Clear local auth token anyway
      this.authToken = null;
      // Clear auth cookie
      if (typeof document !== "undefined") {
        document.cookie = "nx-auth=; path=/; max-age=0";
      }
      return false;
    }
  }

  // Test connection with automatic login
  async testConnection(): Promise<boolean> {
    try {
      // Try to get system info (which may work with session cookie)
      try {
        const info = await this.getSystemInfo();
        if (info) {
          return true; // We have a valid session
        }
      } catch (error) {
        // Session might be expired, try to login
      }

      // Check if server is available
      const isAvailable = await this.isApiAvailable();
      if (!isAvailable) {
        return false;
      }

      // Try to authenticate
      if (API_CONFIG.username && API_CONFIG.password) {
        const loginSuccess = await this.login(API_CONFIG.username!, API_CONFIG.password!);
        return loginSuccess;
      }

      return isAvailable;
    } catch (error) {
      return false;
    }
  }
}

// Create singleton instance
export const nxAPI = new NxWitnessAPI();

// Auto-login if credentials are provided
if (typeof window !== "undefined" && API_CONFIG.username && API_CONFIG.password) {
  // Delay auto-login to allow component initialization
  setTimeout(async () => {
    try {
      const success = await nxAPI.login(API_CONFIG.username!, API_CONFIG.password!);
      console.log("[nxAPI] Auto-login result:", success);

      if (success) {
        // Prefetch critical data to prime the cache
        console.log("[nxAPI] Prefetching critical data...");
        // Use Promise.allSetled to not block if one fails
        await Promise.allSettled([
          nxAPI.getCameras(),
          nxAPI.getSystemInfo(),
          nxAPI.getServers()
        ]);
        console.log("[nxAPI] Prefetched cameras, system info, and servers.");
      }
    } catch (error) {
      console.error("[nxAPI] Auto-login failed:", error);
    }
  }, 1500);
}

export default nxAPI;
