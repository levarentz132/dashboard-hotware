/**
 * Server types - interfaces for server management module
 */

export interface ServerInfo {
  id: string;
  name: string;
  version?: string;
  status?: string;
  stateOfHealth?: string;
  ownerAccountEmail?: string;
  ownerFullName?: string;
  accessRole?: string;
  customization?: string;
  endpoints?: string[];
  osInfo?: {
    platform: string;
    variant: string;
    variantVersion: string;
  };
  maxCameras?: number;
  isFailoverEnabled?: boolean;
  cpuArchitecture?: string;
  cpuModelName?: string;
  physicalMemory?: number;
  systemRuntime?: string;
}
