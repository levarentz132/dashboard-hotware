'use client'

import { AlertTriangle, Clock, MapPin } from 'lucide-react'
import { useAlarms, useCameras } from '@/hooks/useNxAPI'

export default function RecentAlarmsWidget() {
  const { alarms, loading, error } = useAlarms()
  const { cameras } = useCameras()
  
  // Process alarms to match widget format
  const recentAlarms = alarms.slice(0, 5).map(alarm => {
    const camera = cameras.find(c => c.id === alarm.cameraId)
    return {
      id: alarm.id,
      type: alarm.type,
      camera: camera?.name || `Camera ${alarm.cameraId}`,
      location: camera?.location || camera?.ip || 'Unknown',
      severity: alarm.type.toLowerCase().includes('offline') ? 'critical' :
                alarm.type.toLowerCase().includes('motion') ? 'high' :
                alarm.type.toLowerCase().includes('tamper') ? 'medium' : 'low',
      timestamp: formatTimestamp(alarm.timestamp),
      status: 'active' // Default status for real alarms
    }
  })

  // Helper function to format timestamp
  function formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes} minutes ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hours ago`
    const days = Math.floor(hours / 24)
    return `${days} days ago`
  }

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

  const activeAlarmsCount = recentAlarms.filter(a => a.status === 'active').length

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Alarms</h3>
        <div className="flex items-center space-x-2">
          {activeAlarmsCount > 0 && (
            <>
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-600">{activeAlarmsCount} Active</span>
            </>
          )}
          {activeAlarmsCount === 0 && !loading && (
            <span className="text-sm text-gray-500">No active alarms</span>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {loading && (
          <div className="text-center py-4 text-gray-500">
            Loading alarms...
          </div>
        )}
        
        {error && !loading && (
          <div className="text-center py-4 text-red-600">
            Unable to load alarms
          </div>
        )}
        
        {!loading && !error && recentAlarms.length === 0 && (
          <div className="text-center py-4 text-gray-500">
            No recent alarms
          </div>
        )}
        
        {!loading && recentAlarms.map((alarm) => (
          <div key={alarm.id} className="border-l-4 border-gray-200 pl-4 py-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900">{alarm.type}</span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(alarm.severity)}`}>
                    {alarm.severity}
                  </span>
                </div>
                
                <div className="text-sm text-gray-600 mb-2">
                  {alarm.camera} • {alarm.location}
                </div>
                
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{alarm.timestamp}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span>ID: {alarm.id}</span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(alarm.status)}`}></div>
                <span className="text-xs text-gray-500 capitalize">{alarm.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
          View alarm console →
        </button>
      </div>
    </div>
  )
}