/**
 * Alarm-related types
 */

export interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
  isOnline?: boolean;
}

export interface CloudServer {
  id: string;
  name: string;
  url: string;
  status: string;
}

export interface ServerOption {
  id: string;
  name: string;
  type: "local" | "cloud";
  status?: string;
  accessRole?: string;
}

export interface EventLog {
  actionType: string;
  actionParams: {
    actionId: string;
    needConfirmation: boolean;
    actionResourceId: string;
    url: string;
    emailAddress: string;
    fps: number;
    streamQuality: string;
    recordAfter: number;
    relayOutputId: string;
    sayText: string;
    tags: string;
    text: string;
    durationMs: number;
    additionalResources: string[];
    allUsers: boolean;
    forced: boolean;
    presetId: string;
    useSource: boolean;
    recordBeforeMs: number;
    playToClient: boolean;
    contentType: string;
    authType: string;
    httpMethod: string;
  };
  eventParams: {
    eventType: string;
    eventTimestampUsec: string;
    eventResourceId: string;
    resourceName: string;
    sourceServerId: string;
    reasonCode: string;
    inputPortId: string;
    caption: string;
    description: string;
    metadata: {
      cameraRefs: string[];
      instigators: string[];
      allUsers: boolean;
      level: string;
    };
    omitDbLogging: boolean;
    analyticsEngineId: string;
    objectTrackId: string;
    key: string;
    attributes: { name: string; value: string }[];
    progress: number;
  };
  businessRuleId: string;
  aggregationCount: number;
  flags: number;
  compareString: string;
}
