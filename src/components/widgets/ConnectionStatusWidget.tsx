'use client'

import { useState, useEffect } from 'react'
import { Network, AlertCircle, CheckCircle, Clock } from 'lucide-react'

interface ConnectionStatusWidgetProps {
  className?: string
}

export default function ConnectionStatusWidget({ className = '' }: ConnectionStatusWidgetProps) {
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking')
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<string | null>(null)

  const checkConnection = async () => {
    try {
      setStatus('checking')
      setError(null)
      
      const { nxAPI } = await import('@/lib/nxapi')
      const isConnected = await nxAPI.testConnection()
      
      if (isConnected) {
        setStatus('connected')
        setError(null)
      } else {
        setStatus('disconnected')
        setError('Nx Witness server not reachable')
      }
      
      setLastChecked(new Date().toLocaleTimeString())
    } catch (err) {
      setStatus('disconnected')
      setError(err instanceof Error ? err.message : 'Connection check failed')
      setLastChecked(new Date().toLocaleTimeString())
    }
  }

  // Check connection on component mount and every 30 seconds
  useEffect(() => {
    checkConnection()
    const interval = setInterval(checkConnection, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = () => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'disconnected':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-yellow-500 animate-spin" />
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'connected':
        return 'API Connected'
      case 'disconnected':
        return 'API Offline'
      default:
        return 'Checking...'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'connected':
        return 'bg-green-50 border-green-200'
      case 'disconnected':
        return 'bg-red-50 border-red-200'
      default:
        return 'bg-yellow-50 border-yellow-200'
    }
  }

  return (
    <div className={`${getStatusColor()} border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Network className="w-6 h-6 text-gray-600" />
          <div>
            <h3 className="font-semibold text-gray-800">Nx Witness API</h3>
            <div className="flex items-center space-x-2">
              {getStatusIcon()}
              <span className={`text-sm ${
                status === 'connected' ? 'text-green-700' :
                status === 'disconnected' ? 'text-red-700' :
                'text-yellow-700'
              }`}>
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>
        
        <button
          onClick={checkConnection}
          disabled={status === 'checking'}
          className="px-3 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 p-2 bg-white rounded text-sm text-red-600">
          <strong>Error:</strong> {error}
        </div>
      )}

      {lastChecked && (
        <div className="mt-2 text-xs text-gray-500">
          Last checked: {lastChecked}
        </div>
      )}

      <div className="mt-3 text-xs text-gray-600">
        <div>Endpoint: https://localhost:7001/rest/v3</div>
        <div>Status: {status === 'connected' ? 'Live data active' : 'No connection'}</div>
      </div>
    </div>
  )
}