'use client'

import { Server, Wifi, Database, Cpu } from 'lucide-react'

export default function SystemStatusWidget() {
  const systemStats = [
    { label: 'Server Status', value: 'Online', status: 'healthy', icon: Server },
    { label: 'Network', value: '98.5%', status: 'healthy', icon: Wifi },
    { label: 'Database', value: 'Connected', status: 'healthy', icon: Database },
    { label: 'CPU Usage', value: '45%', status: 'warning', icon: Cpu },
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

  const getStatusDot = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'critical':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">System Status</h3>
      
      <div className="space-y-4">
        {systemStats.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${getStatusColor(stat.status)}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">{stat.label}</div>
                  <div className="text-sm text-gray-500">{stat.value}</div>
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${getStatusDot(stat.status)}`}></div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-100">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Last updated:</span>
          <span className="text-gray-900 font-medium">2 minutes ago</span>
        </div>
      </div>
    </div>
  )
}