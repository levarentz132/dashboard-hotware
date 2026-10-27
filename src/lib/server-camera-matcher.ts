import type { ServerUptimeResult } from "./server-uptime-calculator";

export function cleanId(id?: string | null): string {
  return String(id || "").replace(/[{}]/g, "").trim().toLowerCase();
}

export interface MatchedServerInfo {
  server?: any;
  serverResult?: ServerUptimeResult;
  serverName: string;
}

export function findServerResultForServer(
  server: any,
  serverResults: ServerUptimeResult[] = []
): ServerUptimeResult | undefined {
  if (!server || serverResults.length === 0) return undefined;

  const srvIdClean = cleanId(server.id || server.serverId);
  const srvNameClean = cleanId(server.name || server.serverName);
  const srvSysId = cleanId(server._systemId || server.systemId);

  return serverResults.find((r) => {
    const rIdClean = cleanId(r.serverId);
    const rNameClean = cleanId(r.serverName);

    if (srvIdClean && (rIdClean === srvIdClean || rNameClean === srvIdClean)) return true;
    if (srvNameClean && (rNameClean === srvNameClean || rIdClean === srvNameClean)) return true;
    if (srvSysId && (rIdClean === srvSysId || rNameClean === srvSysId)) return true;
    return false;
  });
}

export function findServerForCamera(
  cam: any,
  servers: any[] = [],
  serverResults: ServerUptimeResult[] = []
): MatchedServerInfo {
  if (!cam) {
    return { serverName: "SERVER 01" };
  }

  const cleanCamServerId = cleanId(cam.serverId || cam.parentId);
  const camSystemId = cleanId(cam._systemId || cam.systemId);
  const camSystemName = cleanId(cam._systemName || cam.systemName);
  const camServerName = cleanId(cam.serverName);

  let matchedSrv: any = undefined;
  let matchedRes: ServerUptimeResult | undefined = undefined;

  // 1. Match by clean serverId / parentId
  if (cleanCamServerId) {
    matchedSrv = servers.find((s) => cleanId(s.id || s.serverId) === cleanCamServerId);
    if (!matchedSrv) {
      // Check if serverId matches server name or system ID
      matchedSrv = servers.find(
        (s) => cleanId(s.name) === cleanCamServerId || cleanId(s._systemId) === cleanCamServerId
      );
    }

    matchedRes = serverResults.find(
      (r) =>
        cleanId(r.serverId) === cleanCamServerId ||
        cleanId(r.serverName) === cleanCamServerId
    );

    if (matchedSrv && !matchedRes) {
      matchedRes = findServerResultForServer(matchedSrv, serverResults);
    }

    if (matchedSrv || matchedRes) {
      return {
        server: matchedSrv,
        serverResult: matchedRes,
        serverName: matchedSrv?.name || matchedRes?.serverName || cam.serverName || cam._systemName || "SERVER 01",
      };
    }
  }

  // 2. Match by serverName
  if (camServerName) {
    matchedSrv = servers.find((s) => cleanId(s.name || s.serverName) === camServerName);
    matchedRes = serverResults.find((r) => cleanId(r.serverName || r.serverId) === camServerName);

    if (matchedSrv && !matchedRes) {
      matchedRes = findServerResultForServer(matchedSrv, serverResults);
    }

    if (matchedSrv || matchedRes) {
      return {
        server: matchedSrv,
        serverResult: matchedRes,
        serverName: matchedSrv?.name || matchedRes?.serverName || cam.serverName || "SERVER 01",
      };
    }
  }

  // 3. Match by _systemId / systemId
  if (camSystemId) {
    matchedSrv = servers.find(
      (s) =>
        cleanId(s._systemId || s.systemId) === camSystemId ||
        cleanId(s.id || s.serverId) === camSystemId
    );

    matchedRes = serverResults.find(
      (r) => cleanId(r.serverId) === camSystemId || cleanId(r.serverName) === camSystemId
    );

    if (matchedSrv && !matchedRes) {
      matchedRes = findServerResultForServer(matchedSrv, serverResults);
    }

    if (matchedSrv || matchedRes) {
      return {
        server: matchedSrv,
        serverResult: matchedRes,
        serverName: matchedSrv?.name || matchedRes?.serverName || cam._systemName || "SERVER 01",
      };
    }
  }

  // 4. Match by _systemName / systemName
  if (camSystemName) {
    matchedSrv = servers.find(
      (s) =>
        cleanId(s._systemName || s.systemName) === camSystemName ||
        cleanId(s.name || s.serverName) === camSystemName
    );

    matchedRes = serverResults.find(
      (r) => cleanId(r.serverName) === camSystemName || cleanId(r.serverId) === camSystemName
    );

    if (matchedSrv && !matchedRes) {
      matchedRes = findServerResultForServer(matchedSrv, serverResults);
    }

    if (matchedSrv || matchedRes) {
      return {
        server: matchedSrv,
        serverResult: matchedRes,
        serverName: matchedSrv?.name || matchedRes?.serverName || cam._systemName || "SERVER 01",
      };
    }
  }

  // 5. Fallback: If only 1 server exists or only 1 serverResult exists
  if (servers.length === 1) {
    const singleSrv = servers[0];
    const singleRes =
      serverResults.length === 1
        ? serverResults[0]
        : findServerResultForServer(singleSrv, serverResults);
    return {
      server: singleSrv,
      serverResult: singleRes,
      serverName: singleSrv?.name || singleRes?.serverName || cam.serverName || cam._systemName || "SERVER 01",
    };
  }

  if (serverResults.length === 1) {
    return {
      serverResult: serverResults[0],
      serverName: serverResults[0].serverName || cam.serverName || cam._systemName || "SERVER 01",
    };
  }

  const defaultName = cam.serverName || cam._systemName || "SERVER 01";
  return { serverName: defaultName };
}

export function isServerDown(server?: any, serverResult?: ServerUptimeResult): boolean {
  if (server) {
    if (server.isOfflinePlaceholder === true) return true;
    if (server.isOnline === false) return true;
    const status = String(server.status ?? server.stateOfHealth ?? "").toLowerCase();
    if (status === "offline" || status === "disconnected") return true;
  }
  if (serverResult) {
    if (serverResult.currentStatus === "offline") return true;
    if (serverResult.activeOutage === true) return true;
  }
  return false;
}

