'use client'

import { Activity, Server, Database, Wifi, AlertTriangle, CheckCircle, XCircle } from 'lucide-react'

export default function SystemHealth() {
  const healthMetrics = [
    {
      category: 'Server Health',
      icon: Server,
      metrics: [
        { name: 'CPU Usage', value: '45%', status: 'healthy', threshold: '< 80%' },
        { name: 'Memory Usage', value: '62%', status: 'healthy', threshold: '< 85%' },
        { name: 'Disk Space', value: '78%', status: 'warning', threshold: '< 90%' },
        { name: 'Temperature', value: '67°C', status: 'healthy', threshold: '< 75°C' },
      ]
    },
    {
      category: 'Network Status',
      icon: Wifi,
      metrics: [
        { name: 'Bandwidth Usage', value: '234 Mbps', status: 'healthy', threshold: '< 800 Mbps' },
        { name: 'Packet Loss', value: '0.1%', status: 'healthy', threshold: '< 1%' },
        { name: 'Latency', value: '12ms', status: 'healthy', threshold: '< 50ms' },
        { name: 'Connection Count', value: '248', status: 'healthy', threshold: '< 500' },
      ]
    },
    {
      category: 'Database Health',
      icon: Database,
      metrics: [
        { name: 'Query Performance', value: '95ms avg', status: 'healthy', threshold: '< 200ms' },
        { name: 'Connection Pool', value: '23/50', status: 'healthy', threshold: '< 45/50' },
        { name: 'Index Efficiency', value: '98.2%', status: 'healthy', threshold: '> 95%' },
        { name: 'Deadlocks', value: '0', status: 'healthy', threshold: '< 5/day' },
      ]
    }
  ]

  const systemServices = [
    { name: 'Recording Service', status: 'running', uptime: '15d 7h 23m' },
    { name: 'Web Server', status: 'running', uptime: '15d 7h 23m' },
    { name: 'Database Service', status: 'running', uptime: '15d 7h 23m' },
    { name: 'Analytics Engine', status: 'running', uptime: '2d 14h 45m' },
    { name: 'Archive Service', status: 'stopped', uptime: '0d 0h 0m' },
    { name: 'Notification Service', status: 'running', uptime: '15d 7h 23m' },
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