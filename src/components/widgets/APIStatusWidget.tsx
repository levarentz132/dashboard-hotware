'use client'

import { useSystemInfo, useRealTimeUpdates } from '@/hooks/useNxAPI'
import { Wifi, WifiOff, Server, Clock, RefreshCw } from 'lucide-react'

export default function APIStatusWidget() {
  const { systemInfo, connected, loading, testConnection } = useSystemInfo()
  const { isConnected: realtimeConnected, lastUpdate } = useRealTimeUpdates()

  const handleTestConnection = async () => {
    await testConnection()
  }

  return (
    <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm border border-gray-100 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900">API Status</h3>
        <button
          onClick={handleTestConnection}
          disabled={loading}
          className="p-1 text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3 sm:space-y-4 flex-1">
        {/* Nx Witness Connection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
            <span className="text-sm text-gray-700">Nx Witness API</span>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${
            connected 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        {/* System Info */}
        {systemInfo && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-gray-700">Server</span>
            </div>
            <span className="text-xs text-gray-600">
              {systemInfo.name} v{systemInfo.version}
            </span>
          </div>
        )}

        {/* Real-time Updates */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span className="text-sm text-gray-700">Real-time</span>
          </div>
          <span className="text-xs text-gray-600">
            {realtimeConnected ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Last Update */}
        {lastUpdate && (
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">Last Update</span>
            </div>
            <span className="text-xs text-gray-600">
              {lastUpdate.toLocaleTimeString()}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}