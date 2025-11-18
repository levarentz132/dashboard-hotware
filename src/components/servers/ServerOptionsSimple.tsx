'use client'

import { useState, useEffect } from 'react'
import { Server, Cpu, HardDrive, Network, RefreshCw, AlertTriangle } from 'lucide-react'

interface ServerInfo {
  id: string
  name: string
  version?: string
  status: string
  endpoints: string[]
  osInfo: {
    platform: string
    variant: string
    variantVersion: string
  }
  maxCameras: number
  isFailoverEnabled: boolean
  cpuArchitecture?: string
  cpuModelName?: string
  physicalMemory?: number
  systemRuntime?: string
}

export default function ServerOptions() {
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchServers = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('https://localhost:7001/rest/v3/servers', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('Servers API Response:', data)
      
      setServers(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Error fetching servers:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch servers')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchServers()
  }, [])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading servers...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-600 mr-3" />
            <h3 className="text-lg font-medium text-red-800">Connection Error</h3>
          </div>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchServers}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Server Options</h1>
          <p className="text-gray-600 mt-1">Manage and monitor your Nx Witness servers</p>
        </div>
        <button
          onClick={fetchServers}
          disabled={loading}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle className="w-6 h-6 text-yellow-600 mr-3" />
            <h3 className="text-lg font-medium text-yellow-800">No Servers Found</h3>
          </div>
          <p className="text-yellow-700">No servers are currently available or configured.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {servers.map((server) => (
            <div key={server.id} className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500">
              {/* Server Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Server className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800">{server.name}</h3>
                    <p className="text-sm text-gray-500">Version: {server.version}</p>
                    <p className="text-xs text-gray-400">ID: {server.id}</p>
                  </div>
                </div>
                <div className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Online
                </div>
              </div>

              {/* Server Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Cpu className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">System Info</span>
                  </div>
                  <p className="text-xs text-gray-600">Platform: {server.osInfo?.platform}</p>
                  <p className="text-xs text-gray-600">Version: {server.osInfo?.variantVersion}</p>
                  {server.systemRuntime && (
                    <p className="text-xs text-gray-600">Runtime: {server.systemRuntime}</p>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <HardDrive className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Hardware</span>
                  </div>
                  {server.cpuModelName && (
                    <p className="text-xs text-gray-600">CPU: {server.cpuModelName}</p>
                  )}
                  {server.physicalMemory && (
                    <p className="text-xs text-gray-600">Memory: {formatBytes(server.physicalMemory)}</p>
                  )}
                  <p className="text-xs text-gray-600">Max Cameras: {server.maxCameras}</p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Network className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Network</span>
                  </div>
                  <p className="text-xs text-gray-600">Endpoints:</p>
                  {server.endpoints?.slice(0, 2).map((endpoint, index) => (
                    <p key={index} className="text-xs text-gray-500 truncate">{endpoint}</p>
                  ))}
                  {server.endpoints?.length > 2 && (
                    <p className="text-xs text-gray-400">+{server.endpoints.length - 2} more</p>
                  )}
                </div>
              </div>

              {/* Additional Details */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Additional Information</h4>
                <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Failover Enabled:</span> {server.isFailoverEnabled ? 'Yes' : 'No'}
                  </div>
                  {server.cpuArchitecture && (
                    <div>
                      <span className="font-medium">CPU Architecture:</span> {server.cpuArchitecture}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}