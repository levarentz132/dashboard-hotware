"use client";

import { useState } from "react";
import { API_CONFIG } from "@/lib/config";

export default function ConnectionTest() {
  const [results, setResults] = useState<Array<{ url: string; status: string; error?: string }>>([]);
  const [testing, setTesting] = useState(false);
  const [systemInfoTesting, setSystemInfoTesting] = useState(false);
  const [systemInfoResult, setSystemInfoResult] = useState<{ status: string; data?: any; error?: string } | null>(null);
  const [serversTesting, setServersTesting] = useState(false);
  const [serversResult, setServersResult] = useState<{ status: string; data?: any; error?: string } | null>(null);

  const testConnections = async () => {
    setTesting(true);
    setResults([]);

    const urlsToTest = [
      "https://localhost:7001",
      "https://localhost:7001/rest/v3",
      "https://localhost:7001/rest/v3/servers",
      "https://localhost:7001/rest/v3/system/info",
      API_CONFIG.baseURL,
    ];

    for (const url of urlsToTest) {
      try {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new Error("Connection test timeout")), 3000);

        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          signal: controller.signal,
        });

        setResults((prev) => [
          ...prev,
          {
            url,
            status: `${response.status} ${response.statusText}`,
          },
        ]);
      } catch (error) {
        setResults((prev) => [
          ...prev,
          {
            url,
            status: "Failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        ]);
      }
    }

    setTesting(false);
  };

  const testSystemInfo = async () => {
    setSystemInfoTesting(true);
    setSystemInfoResult(null);

    try {
      const response = await fetch("https://localhost:7001/rest/v3/system/info", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      const responseText = await response.text();
      let parsedData = null;

      try {
        parsedData = JSON.parse(responseText);
      } catch {
        // Not JSON
      }

      setSystemInfoResult({
        status: `${response.status} ${response.statusText}`,
        data: parsedData,
        error: response.ok ? undefined : responseText,
      });
    } catch (error) {
      setSystemInfoResult({
        status: "Failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setSystemInfoTesting(false);
    }
  };

  const testServers = async () => {
    setServersTesting(true);
    setServersResult(null);

    try {
      const response = await fetch("https://localhost:7001/rest/v3/servers", {
        method: "GET",
        mode: "cors",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      });

      const responseText = await response.text();
      let parsedData = null;

      try {
        parsedData = JSON.parse(responseText);
      } catch {
        // Not JSON
      }

      setServersResult({
        status: `${response.status} ${response.statusText}`,
        data: parsedData,
        error: response.ok ? undefined : responseText,
      });
    } catch (error) {
      setServersResult({
        status: "Failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setServersTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Connection Debug Test</h3>
        <div className="flex gap-2">
          <button
            onClick={testConnections}
            disabled={testing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {testing ? "Testing..." : "Test Connections"}
          </button>
          <button
            onClick={testSystemInfo}
            disabled={systemInfoTesting}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {systemInfoTesting ? "Getting Info..." : "Get System Info"}
          </button>
          <button
            onClick={testServers}
            disabled={serversTesting}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {serversTesting ? "Testing..." : "Test Servers"}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-sm text-gray-600">
          Current Configuration:
          <div className="mt-1 bg-gray-50 p-2 rounded text-xs font-mono">
            Base URL: {API_CONFIG.baseURL}
            <br />
            Username: {API_CONFIG.username}
            <br />
            Server: {API_CONFIG.serverHost}:{API_CONFIG.serverPort}
          </div>
        </div>

        {systemInfoResult && (
          <div>
            <h4 className="font-medium text-gray-900 mb-2">System Info Result:</h4>
            <div className="border rounded p-3 bg-gray-50">
              <div
                className={`text-sm font-medium ${
                  systemInfoResult.status.includes("200") ? "text-green-600" : "text-red-600"
                }`}
              >
                {systemInfoResult.status}
              </div>
              {systemInfoResult.error && <div className="text-xs text-red-600 mt-1">{systemInfoResult.error}</div>}
              {systemInfoResult.data && (
                <div className="mt-3">
                  <div className="text-xs text-gray-600 mb-2">System Information:</div>
                  <div className="bg-white p-3 rounded border text-xs space-y-1">
                    <div>
                      <strong>Name:</strong> {systemInfoResult.data.name || "N/A"}
                    </div>
                    <div>
                      <strong>Version:</strong> {systemInfoResult.data.version || "N/A"}
                    </div>
                    <div>
                      <strong>Customization:</strong> {systemInfoResult.data.customization || "N/A"}
                    </div>
                    <div>
                      <strong>Local ID:</strong> {systemInfoResult.data.localId || "N/A"}
                    </div>
                    <div>
                      <strong>Servers:</strong> {systemInfoResult.data.servers?.length || 0}
                    </div>
                    <div>
                      <strong>Devices:</strong> {systemInfoResult.data.devices?.length || 0}
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-blue-600 hover:text-blue-800 text-xs">
                        View Raw JSON
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                        {JSON.stringify(systemInfoResult.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {serversResult && (
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Servers Result:</h4>
            <div className="border rounded p-3 bg-gray-50">
              <div
                className={`text-sm font-medium ${
                  serversResult.status.includes("200") ? "text-green-600" : "text-red-600"
                }`}
              >
                {serversResult.status}
              </div>
              {serversResult.error && <div className="text-xs text-red-600 mt-1">{serversResult.error}</div>}
              {serversResult.data && (
                <div className="mt-3">
                  <div className="text-xs text-gray-600 mb-2">Server Information:</div>
                  <div className="bg-white p-3 rounded border text-xs">
                    <details>
                      <summary className="cursor-pointer text-blue-600 hover:text-blue-800 text-xs">
                        View Server Data JSON
                      </summary>
                      <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-x-auto">
                        {JSON.stringify(serversResult.data, null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Connection Results:</h4>
            <div className="space-y-1">
              {results.map((result, index) => (
                <div key={index} className="text-sm border rounded p-2">
                  <div className="flex justify-between">
                    <span className="font-mono text-xs">{result.url}</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        result.status.includes("200") || result.status.includes("30")
                          ? "bg-green-100 text-green-800"
                          : result.status === "Failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-yellow-100 text-yellow-800"
                      }`}
                    >
                      {result.status}
                    </span>
                  </div>
                  {result.error && <div className="text-xs text-red-600 mt-1">{result.error}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
