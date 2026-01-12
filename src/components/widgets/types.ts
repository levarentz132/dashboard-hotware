/**
 * Widget types - shared interfaces for dashboard widgets
 */

export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

export interface EventLog {
  actionType: string;
  eventParams: {
    eventType: string;
    eventTimestampUsec: string;
    eventResourceId: string;
    resourceName: string;
    caption: string;
    description: string;
    metadata: {
      level: string;
    };
  };
  aggregationCount: number;
}

export interface StorageStatusInfo {
  totalSpace: string;
  freeSpace: string;
  isOnline: boolean;
}

export interface Storage {
  id: string;
  name: string;
  status?: string;
  statusInfo?: StorageStatusInfo | null;
}

export interface AuditLogEntry {
  createdTimeSec: number;
  rangeStartSec: number;
  rangeEndSec: number;
  eventType: string;
  resources: string[];
  params: string;
  authSession: {
    id: string;
    userName: string;
    userHost: string;
    userAgent: string;
  };
}
