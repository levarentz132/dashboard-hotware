import { ICamera, IDeviceType } from "@/types/Device";
import { IServer } from "@/types/Server";
import { API_ENDPOINTS } from "../config";
import { NxWitnessAPIBase } from "./base";
import { NxCamera } from "./types";

export class NxCameraService extends NxWitnessAPIBase {
  // Camera methods
  async getCameras(options?: { skipCache?: boolean }): Promise<NxCamera[]> {
    const cameras = await this.apiRequest<NxCamera[]>(API_ENDPOINTS.devices, options);
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

  async getDevices(options?: { skipCache?: boolean }): Promise<ICamera[]> {
    const devices = await this.apiRequest<ICamera[]>(API_ENDPOINTS.devices, options);
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
            `Device type not found: ${payload.typeId}. Available types: ${deviceTypes.map((t) => t.name).join(", ")}`,
          );
        }
      }

      // Validasi serverId (required field)
      const server = servers.find((s) => s.id === payload.serverId);
      if (!server) {
        throw new Error(
          `Server not found: ${payload.serverId}. Available servers: ${servers.map((s) => s.name).join(", ")}`,
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

  async updateDevice(id: string, deviceData: any): Promise<any> {
    const normalizedId = id.replace(/[{}]/g, "");
    return await this.apiRequest<any>(`/devices/${normalizedId}`, {
      method: "PATCH",
      body: JSON.stringify(deviceData),
    });
  }
}
