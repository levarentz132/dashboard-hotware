/**
 * Storage types - interfaces for storage management
 */

export interface StorageStatusInfo {
  url: string;
  storageId: string;
  totalSpace: string;
  freeSpace: string;
  reservedSpace: string;
  isExternal: boolean;
  isWritable: boolean;
  isUsedForWriting: boolean;
  isBackup: boolean;
  isOnline: boolean;
  storageType: string;
  runtimeFlags: string;
  persistentFlags: string;
  serverId: string;
  name: string;
}

export interface Storage {
  id: string;
  serverId: string;
  name: string;
  path: string;
  type?: string;
  spaceLimitB?: number;
  isUsedForWriting?: boolean;
  isBackup?: boolean;
  status?: string;
  statusInfo?: StorageStatusInfo | null;
}

export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
}

export interface StorageFormData {
  name: string;
  path: string;
  type: string;
  spaceLimitB: number;
  isUsedForWriting: boolean;
  isBackup: boolean;
}

export const defaultStorageFormData: StorageFormData = {
  name: "",
  path: "",
  type: "local",
  spaceLimitB: 10737418240, // 10 GB default
  isUsedForWriting: true,
  isBackup: false,
};

export const STORAGE_TYPES = [
  { value: "local", label: "Local Storage" },
  { value: "network", label: "Network (NAS - Manual)" },
  { value: "smb", label: "SMB (NAS - Auto)" },
] as const;
