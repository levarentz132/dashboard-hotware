/**
 * Cloud-related type definitions
 * Used for Nx Witness cloud API interactions
 */

/**
 * Cloud system information from meta.nxvms.com
 */
interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: "online" | "offline";
  accessRole: "owner" | "administrator" | "viewer" | "custom";
  version?: string;
  ownerFullName?: string;
  ownerAccountEmail?: string;
  organizationId?: string;
  customization?: string;
}

/**
 * Cloud authentication state
 */
interface CloudAuthState {
  isAuthenticated: boolean;
  username?: string;
  systems: CloudSystem[];
  lastRefresh?: Date;
}

/**
 * Cloud server information from relay
 */
interface CloudServerInfo {
  id: string;
  name: string;
  url: string;
  version: string;
  flags: string[];
  status: string;
}

/**
 * Cloud device information from relay
 */
interface CloudDevice {
  id: string;
  name: string;
  physicalId: string;
  serverId: string;
  typeId: string;
  status: string;
  model?: string;
  vendor?: string;
  mac?: string;
  ip?: string;
}

/**
 * Cloud event information
 */
interface CloudEvent {
  id: string;
  timestamp: string;
  eventType: string;
  resourceName?: string;
  caption?: string;
  description?: string;
  objectTrackId?: string;
  serverId?: string;
  deviceId?: string;
}

/**
 * Cloud storage information
 */
interface CloudStorage {
  id: string;
  serverId: string;
  url: string;
  name: string;
  type: string;
  spaceTotalB: number;
  spaceUsedB: number;
  isBackup: boolean;
  isEnabled: boolean;
  status: string;
}

/**
 * Audit log entry from cloud
 */
interface CloudAuditLogEntry {
  rangeStartMs: string;
  rangeEndMs: string;
  recordType?: string;
  serverId?: string;
  eventType?: string;
  userType?: string;
  userId?: string;
  authSession?: string;
  details?: string;
}

export type { CloudSystem, CloudAuthState, CloudServerInfo, CloudDevice, CloudEvent, CloudStorage, CloudAuditLogEntry };
