"use client";

import { AlertTriangle, Bell, RefreshCw, Server, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import nxAPI, { NxMetricsAlarmsResponse } from "@/lib/nxapi";

// Interface for cloud system
interface CloudSystem {
  id: string;
  name: string;
  stateOfHealth: string;
  accessRole: string;
  version?: string;
}

// Interface for server alarms
interface ServerAlarms {
  serverId: string;
  serverName: string;
  alarms: any[];
  rawResponse: NxMetricsAlarmsResponse | null;
  loading: boolean;
  error: string | null;
  username: string;
  password: string;
  configured: boolean;
  lastUpdated: string | null;
  sessionToken: string | null;
}

export default function AlarmConsole() {
  console.log("🚨 ALARM CONSOLE COMPONENT RENDERED 🚨");
  
  const [availableSystems, setAvailableSystems] = useState<CloudSystem[]>([]);
  const [serverAlarms, setServerAlarms] = useState<ServerAlarms[]>([]);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Fetch available cloud systems
  const fetchCloudSystems = useCallback(async () => {
    try {
      // Get system info to retrieve cloud ID
      const systemInfo = await nxAPI.getSystemInfo();
      
      if (!systemInfo) {
        console.error("Failed to get system info");
        return;
      }
      
      // Check if system has cloud ID
      if (!systemInfo.cloudId) {
        console.warn("System is not connected to cloud. Cloud ID not available.");
        alert("This system is not connected to Nx Cloud. Cloud relay features will not work.");
        return;
      }
      
      // Create a single cloud system entry
      const systems: CloudSystem[] = [{
        id: systemInfo.cloudId,
        name: systemInfo.name || 'Nx Witness System',
        stateOfHealth: 'online',
        accessRole: 'admin',
        version: systemInfo.version || ''
      }];
      
      console.log("✅ Cloud system loaded:", systems[0]);
      
      setAvailableSystems(systems);
      
      // Initialize server alarms state
      const initialServerAlarms: ServerAlarms[] = systems.map((system: CloudSystem) => ({
        serverId: system.id,
        serverName: system.name,
        alarms: [],
        rawResponse: null,
        loading: false,
        error: null,
        username: '',
        password: '',
        configured: false,
        lastUpdated: null,
        sessionToken: null
      }));
      setServerAlarms(initialServerAlarms);
    } catch (error) {
      console.error("Failed to fetch cloud systems:", error);
    }
  }, []);

  // Login to cloud relay and get session token
  const loginToCloudRelay = useCallback(async (cloudId: string, username: string, password: string): Promise<string | null> => {
    try {
      const loginUrl = `https://${cloudId}.relay.vmsproxy.com/rest/v3/login/sessions`;
      
      console.log(`[Login] Attempting to login to ${loginUrl}`);
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
          setCookie: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Login failed: HTTP ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log(`[Login] Success! Token obtained for ${cloudId}`);
      console.log(`🎫 Token:`, data.token);
      console.log(`🎫 Token length:`, data.token.length);
      
      return data.token;
    } catch (error) {
      console.error(`[Login] Failed for ${cloudId}:`, error);
      throw error;
    }
  }, []);

  // Fetch alarms for a specific server using cloud relay
  const fetchServerAlarms = useCallback(async (cloudId: string) => {
    const server = serverAlarms.find(s => s.serverId === cloudId);
    if (!server || !server.configured) {
      console.warn(`Credentials not configured for server ${cloudId}`);
      return;
    }
    
    // Get or obtain token
    let token = server.sessionToken;
    if (!token) {
      console.log(`[Fetch] No token found, logging in first...`);
      try {
        token = await loginToCloudRelay(cloudId, server.username, server.password);
        if (!token) {
          throw new Error('Failed to obtain session token');
        }
        // Store the token
        setServerAlarms(prev => prev.map(s => 
          s.serverId === cloudId ? { ...s, sessionToken: token } : s
        ));
      } catch (error) {
        setServerAlarms(prev => prev.map(s => 
          s.serverId === cloudId 
            ? { ...s, loading: false, error: 'Login failed: ' + (error instanceof Error ? error.message : 'Unknown error') }
            : s
        ));
        return;
      }
    }

    setServerAlarms(prev => prev.map(s => 
      s.serverId === cloudId 
        ? { ...s, loading: true, error: null }
        : s
    ));

    try {
      // Call cloud relay endpoint with session token as Bearer token
      const cloudRelayUrl = `https://${cloudId}.relay.vmsproxy.com/rest/v3/system/metrics/alarms`;
      
      console.log(`[Fetch] Requesting alarms from ${cloudRelayUrl}`);
      console.log(`🎫 Using token:`, token);
      
      const response = await fetch(cloudRelayUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: NxMetricsAlarmsResponse = await response.json();
      const timestamp = new Date().toLocaleString();
        
      // Log the response to console for debugging
      console.log(`[${timestamp}] ====== ALARM API RESPONSE ======`);
      console.log(`Cloud ID: ${cloudId}`);
      console.log(`URL: ${cloudRelayUrl}`);
      console.log(`Full Response:`, JSON.stringify(data, null, 2));
        
      // Extract alarms from the nested structure
      let allAlarms: any[] = [];
      
      console.log(`[${timestamp}] Checking data.servers:`, data.servers ? 'EXISTS' : 'MISSING');
      
      if (data.servers) {
        const serverIds = Object.keys(data.servers);
        console.log(`[${timestamp}] Found ${serverIds.length} server(s) in response:`, serverIds);
        
        serverIds.forEach(serverId => {
          const serverData = data.servers[serverId];
          console.log(`[${timestamp}] Processing server ${serverId}:`, serverData);
          
          // Check both 'info' and 'load' structures
          const alarmSources = [];
          if (serverData.info) {
            console.log(`[${timestamp}]   - Found 'info' structure with keys:`, Object.keys(serverData.info));
            alarmSources.push({ source: 'info', data: serverData.info });
          }
          if (serverData.load) {
            console.log(`[${timestamp}]   - Found 'load' structure with keys:`, Object.keys(serverData.load));
            alarmSources.push({ source: 'load', data: serverData.load });
          }
          
          if (alarmSources.length === 0) {
            console.log(`[${timestamp}]   - No 'info' or 'load' found for server ${serverId}`);
          }
          
          alarmSources.forEach(({ source, data: alarmData }) => {
            Object.keys(alarmData).forEach(alarmType => {
              const alarmList = alarmData[alarmType];
              console.log(`[${timestamp}]     - Checking ${source}.${alarmType}:`, Array.isArray(alarmList) ? `Array with ${alarmList.length} items` : typeof alarmList);
              
              if (Array.isArray(alarmList)) {
                // Add metadata for display
                const enrichedAlarms = alarmList.map(alarm => ({
                  ...alarm,
                  alarmType: alarmType,
                  source: source,
                  serverId: serverId
                }));
                console.log(`[${timestamp}]       - Added ${enrichedAlarms.length} alarm(s) from ${alarmType}`);
                allAlarms = [...allAlarms, ...enrichedAlarms];
              }
            });
          });
        });
      } else {
        console.log(`[${timestamp}] ERROR: No 'servers' key in response!`);
      }
        
        console.log(`[${timestamp}] Extracted ${allAlarms.length} alarm(s)`);
        console.log(`=============================`);
      
      console.log(`[${timestamp}] Extracted ${allAlarms.length} alarm(s)`);
      console.log(`=============================`);
        
      setServerAlarms(prev => prev.map(s => 
        s.serverId === cloudId 
          ? { 
              ...s, 
              alarms: allAlarms,
              rawResponse: data,
              loading: false,
              error: null,
              lastUpdated: timestamp
            }
          : s
      ));
    } catch (error) {
      console.error(`Failed to fetch alarms for server ${cloudId}:`, error);
      setServerAlarms(prev => prev.map(s => 
        s.serverId === cloudId 
          ? { 
              ...s, 
              loading: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          : s
      ));
    }
  }, [serverAlarms, loginToCloudRelay]);

  // Fetch all server alarms
  const fetchAllServerAlarms = useCallback(() => {
    serverAlarms.filter(s => s.configured).forEach(server => {
      fetchServerAlarms(server.serverId);
    });
  }, [serverAlarms, fetchServerAlarms]);

  // Handle credentials configuration for a specific server
  const handleConfigureServer = async (serverId: string, username: string, password: string) => {
    if (username && password) {
      // First, login to get the session token
      setServerAlarms(prev => prev.map(s => 
        s.serverId === serverId 
          ? { ...s, username, password, configured: true, loading: true }
          : s
      ));
      
      try {
        const token = await loginToCloudRelay(serverId, username, password);
        if (token) {
          setServerAlarms(prev => prev.map(s => 
            s.serverId === serverId 
              ? { ...s, sessionToken: token }
              : s
          ));
          // Now fetch alarms
          setTimeout(() => fetchServerAlarms(serverId), 100);
        }
      } catch (error) {
        setServerAlarms(prev => prev.map(s => 
          s.serverId === serverId 
            ? { ...s, loading: false, error: 'Login failed: ' + (error instanceof Error ? error.message : 'Unknown error'), configured: false }
            : s
        ));
      }
    }
  };

  // Toggle server expansion
  const toggleServerExpansion = (serverId: string) => {
    setExpandedServers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(serverId)) {
        newSet.delete(serverId);
      } else {
        newSet.add(serverId);
      }
      return newSet;
    });
  };

  // Initial fetch
  useEffect(() => {
    console.log("🔄 AlarmConsole useEffect triggered - fetching cloud systems...");
    fetchCloudSystems();
  }, [fetchCloudSystems]);

  // Auto-refresh every 30 seconds for configured servers
  useEffect(() => {
    const configuredServers = serverAlarms.filter(s => s.configured);
    if (configuredServers.length === 0) return;

    const interval = setInterval(() => {
      fetchAllServerAlarms();
    }, 30000);

    return () => clearInterval(interval);
  }, [serverAlarms, fetchAllServerAlarms]);

  // Calculate total stats
  const totalAlarms = serverAlarms.reduce((sum, server) => sum + server.alarms.length, 0);
  const totalServers = availableSystems.length;
  const configuredServers = serverAlarms.filter(s => s.configured).length;
  const serversWithAlarms = serverAlarms.filter(s => s.alarms.length > 0).length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Alarm Console</h1>
            <p className="text-gray-500 mt-1">Cloud Relay - Per Server Alarm Monitoring</p>
          </div>
          <div className="flex gap-2">
            {configuredServers > 0 && (
              <button
                onClick={fetchAllServerAlarms}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh All ({configuredServers})
              </button>
            )}
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Servers</p>
                <p className="text-2xl font-bold text-gray-900">{totalServers}</p>
              </div>
              <Server className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Servers with Alarms</p>
                <p className="text-2xl font-bold text-orange-600">{serversWithAlarms}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-500" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Alarms</p>
                <p className="text-2xl font-bold text-red-600">{totalAlarms}</p>
              </div>
              <Bell className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>
      </div>

      {/* Server Alarms List */}
      <div className="space-y-4">
        {serverAlarms.map((server) => (
          <div key={server.serverId} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Server Header */}
            <div
              className="p-4 bg-gray-50 border-b border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => toggleServerExpansion(server.serverId)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Server className="w-5 h-5 text-gray-600" />
                  <div>
                    <h3 className="font-semibold text-gray-900">{server.serverName}</h3>
                    <p className="text-xs text-gray-500 font-mono">{server.serverId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {server.loading && (
                    <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  {server.error && (
                    <span className="text-sm text-red-600">Error: {server.error}</span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      server.alarms.length > 0 
                        ? 'bg-red-100 text-red-700' 
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {server.alarms.length} alarm{server.alarms.length !== 1 ? 's' : ''}
                    </span>
                    {expandedServers.has(server.serverId) ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Content */}
            {expandedServers.has(server.serverId) && (
              <div className="p-4">
                {/* Credential Configuration Form (if not configured) */}
                {!server.configured && (
                  <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-3">Configure Server Credentials</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          id={`username-${server.serverId}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter username"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Password
                        </label>
                        <input
                          type="password"
                          id={`password-${server.serverId}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Enter password"
                        />
                      </div>
                      <button
                        onClick={() => {
                          const usernameInput = document.getElementById(`username-${server.serverId}`) as HTMLInputElement;
                          const passwordInput = document.getElementById(`password-${server.serverId}`) as HTMLInputElement;
                          if (usernameInput && passwordInput) {
                            const username = usernameInput.value.trim();
                            const password = passwordInput.value.trim();
                            console.log(`🔐 Configure button clicked for ${server.serverName}`);
                            console.log(`📝 Username: ${username}`);
                            console.log(`📝 Password: ${password ? '***' : '(empty)'}`);
                            if (username && password) {
                              handleConfigureServer(server.serverId, username, password);
                            } else {
                              alert('Please enter both username and password');
                            }
                          }
                        }}
                        className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
                      >
                        Configure & Fetch Alarms
                      </button>
                    </div>
                  </div>
                )}

{/* API Endpoint and Last Updated */}
                    <div className="mb-4 space-y-2">
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">API Endpoint:</p>
                        <p className="text-sm font-mono text-gray-700">
                          https://{server.serverId}.relay.vmsproxy.com/rest/v3/system/metrics/alarms
                        </p>
                      </div>
                      {server.lastUpdated && (
                        <div className="p-3 bg-green-50 rounded-lg">
                          <p className="text-xs text-green-600 mb-1">Last Updated:</p>
                          <p className="text-sm font-mono text-green-800">{server.lastUpdated}</p>
                        </div>
                      )}
                </div>

                {/* Alarms List */}
                {server.alarms.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    <h4 className="font-medium text-gray-700 mb-2">Alarms:</h4>
                    {server.alarms.map((alarm, idx) => {
                      const level = alarm.level || alarm.metadata?.level || 'info';
                      const text = alarm.text || alarm.description || alarm.caption || 'No description';
                      const alarmType = alarm.alarmType || 'Unknown';
                      
                      return (
                        <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle className="w-4 h-4 text-red-600" />
                                <span className="font-medium text-red-900">
                                  {alarmType}
                                </span>
                              </div>
                              <p className="text-sm text-red-700 ml-6">{text}</p>
                              {alarm.source && (
                                <p className="text-xs text-gray-500 ml-6 mt-1">Source: {alarm.source}</p>
                              )}
                            </div>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              level === 'error' || level === 'critical'
                                ? 'bg-red-200 text-red-800'
                                : level === 'warning'
                                ? 'bg-yellow-200 text-yellow-800'
                                : 'bg-blue-200 text-blue-800'
                            }`}>
                              {level.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-6 text-center text-gray-500 mb-4">
                    <Bell className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No alarms for this server</p>
                  </div>
                )}

                {/* Raw Response */}
                {server.rawResponse && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                      View Raw API Response
                    </summary>
                    <pre className="mt-2 p-3 bg-gray-900 text-green-400 rounded-lg overflow-x-auto text-xs">
                      {JSON.stringify(server.rawResponse, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty State */}
      {serverAlarms.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <Server className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Servers Found</h3>
          <p className="text-gray-500">
            No cloud systems are available. Please check your configuration.
          </p>
        </div>
      )}
    </div>
  );
}
