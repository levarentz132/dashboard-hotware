import { ICamera, IDeviceType } from "@/types/Device";

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
  schedule?: {
    isEnabled: boolean;
    tasks: any[];
    minArchivePeriodS?: number;
    maxArchivePeriodS?: number;
  };
  motion?: {
    recordBeforeS?: number;
    recordAfterS?: number;
  };
}

export interface NxEvent {
  id: string;
  timestamp: string;
  cameraId: string;
  type: string;
  description: string;
  metadata?: Record<string, any>;
}

export interface NxMetricsAlarm {
  level?: string;
  text?: string;
  message?: string;
  caption?: string;
  timestamp?: string;
  deviceId?: string;
  serverId?: string;
  [key: string]: any;
}

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
