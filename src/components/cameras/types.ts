/**
 * Camera-related types
 */

export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
}

export interface CloudCamera {
  id: string;
  name: string;
  physicalId?: string;
  url?: string;
  typeId?: string;
  mac?: string;
  serverId?: string;
  vendor?: string;
  model?: string;
  logicalId?: string;
  status?: string;
  systemId: string;
  systemName: string;
}

export interface CamerasBySystem {
  systemId: string;
  systemName: string;
  stateOfHealth: string;
  accessRole: string;
  cameras: CloudCamera[];
  expanded: boolean;
}

export interface SystemCredentials {
  [systemId: string]: {
    username: string;
    password: string;
    token?: string;
    loggedIn: boolean;
  };
}

export interface CameraDevice {
  id: string;
  name: string;
  physicalId: string;
  url: string;
  typeId: string;
  mac: string;
  serverId: string;
  vendor: string;
  model: string;
  logicalId: string;
  status: string;
  ip?: string;
  location?: string;
  type?: string;
  resolution?: string;
  fps?: number;
  group?: { id: string; name: string };
  credentials?: { user: string; password: string };
}

// Location interfaces
export interface Province {
  id: string;
  name: string;
}

export interface Regency {
  id: string;
  province_id: string;
  name: string;
}

export interface District {
  id: string;
  regency_id: string;
  name: string;
}

export interface Village {
  id: string;
  district_id: string;
  name: string;
}
