interface ICamera {
  id: string;
  physicalId?: string;
  url: string;
  typeId?: string;
  name: string;
  mac?: string;
  serverId: string;
  isManuallyAdded?: boolean;
  vendor?: string;
  model?: string;
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

export type { ICamera };
