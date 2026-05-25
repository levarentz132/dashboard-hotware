/**
 * Canonical cloud system types (client + shared modules).
 */

export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
  ownerFullName?: string;
  ownerAccountEmail?: string;
  organizationId?: string;
  customization?: string;
  isLocal?: boolean;
  systemName?: string;
}
