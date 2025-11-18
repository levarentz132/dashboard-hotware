'use client'

import { AlertTriangle, Bell, Filter, Search, MapPin, Camera, Clock, X, Check, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useAlarms, useEvents, useCameras } from '@/hooks/useNxAPI'

export default function AlarmConsole() {
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSeverity, setFilterSeverity] = useState('all')
  
  // API hooks
  const { alarms: apiAlarms, loading: alarmsLoading, refetch: refetchAlarms } = useAlarms()
  const { events, loading: eventsLoading, refetch: refetchEvents } = useEvents()
  const { cameras } = useCameras()
  


  // Process API alarms and events into unified format
  const processedAlarms = [...apiAlarms, ...events].map(item => {
    // Find camera info
    const camera = cameras.find(c => c.id === item.cameraId)
    
    return {
      id: item.id,
      type: item.type,
      camera: camera?.name || `Camera ${item.cameraId}`,
      cameraId: item.cameraId,
      location: camera?.ip || 'Unknown location',
      severity: item.type.toLowerCase().includes('offline') ? 'critical' :
                item.type.toLowerCase().includes('motion') ? 'high' :
                item.type.toLowerCase().includes('tamper') ? 'medium' : 'low',
      timestamp: new Date(item.timestamp),
      status: item.type.toLowerCase().includes('offline') ? 'active' : 'acknowledged',
      description: item.description,
      screenshot: null,
      assignedTo: null
    }
  })
  
  // Use only processed alarms from server
  const allAlarms = processedAlarms

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-red-500'
      case 'acknowledged':
        return 'bg-yellow-500'
      case 'resolved':
        return 'bg-green-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Bell className="w-4 h-4 text-red-600" />
      case 'acknowledged':
        return <Clock className="w-4 h-4 text-yellow-600" />
      case 'resolved':
        return <Check className="w-4 h-4 text-green-600" />
      default:
        return <AlertTriangle className="w-4 h-4 text-gray-600" />
    }
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getTimeAgo = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    
    if (minutes < 60) {
      return `${minutes} min ago`
    } else if (hours < 24) {
      return `${hours}h ago`
    } else {
      return formatDate(date)
    }
  }

  const filteredAlarms = allAlarms.filter(alarm => {
    const statusMatch = filterStatus === 'all' || alarm.status === filterStatus
    const severityMatch = filterSeverity === 'all' || alarm.severity === filterSeverity
    return statusMatch && severityMatch
  })

  const activeAlarms = allAlarms.filter(alarm => alarm.status === 'active').length
  const acknowledgedAlarms = allAlarms.filter(alarm => alarm.status === 'acknowledged').length
  const resolvedAlarms = allAlarms.filter(alarm => alarm.status === 'resolved').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Alarm Console</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-600">Real-time monitoring</span>
          </div>
          <button
            onClick={() => {
              refetchAlarms()
              refetchEvents()
            }}
            disabled={alarmsLoading || eventsLoading}
            className={`flex items-center space-x-2 px-4 py-2 border rounded-lg hover:bg-gray-50 mr-2 ${
              (alarmsLoading || eventsLoading) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${(alarmsLoading || eventsLoading) ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Bell className="w-4 h-4" />
            <span>Configure Alerts</span>
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <div>
              <div className="text-2xl font-bold text-red-600">{activeAlarms}</div>
              <div className="text-sm text-gray-600">Active Alarms</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <div>
              <div className="text-2xl font-bold text-yellow-600">{acknowledgedAlarms}</div>
              <div className="text-sm text-gray-600">Acknowledged</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <div>
              <div className="text-2xl font-bold text-green-600">{resolvedAlarms}</div>
              <div className="text-sm text-gray-600">Resolved</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-gray-600" />
            <div>
              <div className="text-2xl font-bold text-gray-900">{allAlarms.length}</div>
              <div className="text-sm text-gray-600">Total Today</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="flex items-center justify-between space-x-4">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search alarms..."
                className="pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <select 
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>

            <select 
              className="border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
            >
              <option value="all">All Severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button className="flex items-center space-x-2 px-3 py-2 border rounded-lg hover:bg-gray-50">
              <Filter className="w-4 h-4" />
              <span>More Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alarms List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">
            Recent Alarms ({filteredAlarms.length})
            {(alarmsLoading || eventsLoading) && (
              <RefreshCw className="inline w-4 h-4 ml-2 animate-spin" />
            )}
          </h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredAlarms.map((alarm) => (
            <div key={alarm.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    {getStatusIcon(alarm.status)}
                    <span className="font-medium text-gray-900">{alarm.type}</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(alarm.severity)}`}>
                      {alarm.severity}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(alarm.status)}`}></div>
                    <span className="text-xs text-gray-500 capitalize">{alarm.status}</span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-3">{alarm.description}</div>
                  
                  <div className="flex items-center space-x-6 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Camera className="w-4 h-4" />
                      <span>{alarm.camera} ({alarm.cameraId})</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <MapPin className="w-4 h-4" />
                      <span>{alarm.location}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(alarm.timestamp)} • {getTimeAgo(alarm.timestamp)}</span>
                    </div>
                    {alarm.assignedTo && (
                      <div className="text-blue-600">
                        Assigned to: {alarm.assignedTo}
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center space-x-2 ml-4">
                  {alarm.status === 'active' && (
                    <>
                      <button className="px-3 py-1 text-sm bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200">
                        Acknowledge
                      </button>
                      <button className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200">
                        Resolve
                      </button>
                    </>
                  )}
                  {alarm.status === 'acknowledged' && (
                    <button className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded hover:bg-green-200">
                      Resolve
                    </button>
                  )}
                  <button className="p-1 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}