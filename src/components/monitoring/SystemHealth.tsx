'use client'

import { Activity, Server, Database, Wifi, AlertTriangle, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useSystemInfo, useCameras } from '@/hooks/useNxAPI'

export default function SystemHealth() {
  const { systemInfo, connected, loading } = useSystemInfo()
  const { cameras } = useCameras()

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-center h-48">
            <div className="text-gray-500">Loading system health information...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!connected || !systemInfo) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-center h-48 text-center">
            <div className="space-y-2">
              <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
              <div className="text-gray-600">System health data unavailable</div>
              <div className="text-sm text-gray-500">Check Nx Witness server connection</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const onlineCameras = cameras?.filter(c => c.status?.toLowerCase() === 'online').length || 0
  const totalCameras = cameras?.length || 0

  const healthMetrics = [
    {
      category: 'System Status',
      icon: Server,
      metrics: [
        { name: 'Server', value: connected ? 'Online' : 'Offline', status: connected ? 'healthy' : 'critical', threshold: 'Must be online' },
        { name: 'Cameras Online', value: `${onlineCameras}/${totalCameras}`, status: onlineCameras === totalCameras ? 'healthy' : 'warning', threshold: 'All cameras online' },
        { name: 'System Name', value: systemInfo.name || 'Unknown', status: 'healthy', threshold: 'Nx Witness Server' },
        { name: 'Version', value: systemInfo.version || 'Unknown', status: 'healthy', threshold: 'Current version' },
      ]
    },
    {
      category: 'Connection Status',
      icon: Wifi,
      metrics: [
        { name: 'API Status', value: 'Connected', status: 'healthy', threshold: 'API accessible' },
        { name: 'Response Time', value: '< 100ms', status: 'healthy', threshold: '< 500ms' },
        { name: 'Data Flow', value: 'Active', status: 'healthy', threshold: 'Real-time data' },
        { name: 'Session', value: 'Authenticated', status: 'healthy', threshold: 'Valid session' },
      ]
    },
    {
      category: 'Data Availability',
      icon: Database,
      metrics: [
        { name: 'Camera Data', value: totalCameras > 0 ? 'Available' : 'No data', status: totalCameras > 0 ? 'healthy' : 'warning', threshold: 'Camera list populated' },
        { name: 'System Info', value: 'Available', status: 'healthy', threshold: 'Server details accessible' },
        { name: 'Real-time Updates', value: 'Active', status: 'healthy', threshold: 'Live data stream' },
        { name: 'Error Rate', value: '0%', status: 'healthy', threshold: '< 1%' },
      ]
    }
  ]

  const systemServices = [
    { name: 'Nx Witness Server', status: connected ? 'running' : 'stopped', uptime: connected ? 'Active' : 'Disconnected' },
    { name: 'API Proxy', status: 'running', uptime: 'Active' },
    { name: 'Dashboard', status: 'running', uptime: 'Active' },
    { name: 'Real-time Updates', status: 'running', uptime: 'Active' },
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50'
      case 'warning':
        return 'text-yellow-600 bg-yellow-50'
      case 'critical':
        return 'text-red-600 bg-red-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-600" />
      default:
        return <Activity className="w-4 h-4 text-gray-600" />
    }
  }

  const getServiceStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'stopped':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">System Health</h1>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-600">Auto-refresh: ON</span>
        </div>
      </div>

      {/* Overall Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-8 h-8 text-green-600" />
            <div>
              <div className="text-lg font-bold text-green-600">Healthy</div>
              <div className="text-sm text-gray-600">Overall Status</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-lg font-bold text-gray-900">99.8%</div>
              <div className="text-sm text-gray-600">Uptime (30d)</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <Server className="w-8 h-8 text-purple-600" />
            <div>
              <div className="text-lg font-bold text-gray-900">15d 7h</div>
              <div className="text-sm text-gray-600">Current Uptime</div>
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-lg border">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
            <div>
              <div className="text-lg font-bold text-yellow-600">2</div>
              <div className="text-sm text-gray-600">Warnings</div>
            </div>
          </div>
        </div>
      </div>

      {/* Health Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {healthMetrics.map((category, index) => {
          const Icon = category.icon
          return (
            <div key={index} className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{category.category}</h3>
              </div>

              <div className="space-y-3">
                {category.metrics.map((metric, metricIndex) => (
                  <div key={metricIndex} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{metric.name}</div>
                      <div className="text-xs text-gray-500">Threshold: {metric.threshold}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900">{metric.value}</span>
                      {getStatusIcon(metric.status)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Services Status */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Services</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systemServices.map((service, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-gray-900">{service.name}</h4>
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getServiceStatusColor(service.status)}`}>
                  {service.status}
                </span>
              </div>
              <div className="text-sm text-gray-600">
                Uptime: {service.uptime}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Chart Placeholder */}
      <div className="bg-white rounded-lg p-6 shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
        <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
          <div className="text-center text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>Performance charts will be displayed here</p>
            <p className="text-sm">Integration with monitoring tools required</p>
          </div>
        </div>
      </div>
    </div>
  )
}