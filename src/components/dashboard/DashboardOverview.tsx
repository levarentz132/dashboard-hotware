'use client'

import { Camera, Activity, AlertTriangle, Database, TrendingUp, Users, Wifi, WifiOff } from 'lucide-react'
import { useCameras, useAlarms, useSystemInfo, useRealTimeUpdates } from '@/hooks/useNxAPI'
import StatsCard from '@/components/ui/StatsCard'
import SystemStatusWidget from '@/components/widgets/SystemStatusWidget'
import CameraStatusGrid from '@/components/widgets/CameraStatusGrid'
import RecentAlarmsWidget from '@/components/widgets/RecentAlarmsWidget'
import StorageWidget from '@/components/widgets/StorageWidget'
import APIStatusWidget from '@/components/widgets/APIStatusWidget'
import ConnectionStatusWidget from '@/components/widgets/ConnectionStatusWidget'

export default function DashboardOverview() {
  // API hooks
  const { cameras, loading: camerasLoading } = useCameras()
  const { alarms, loading: alarmsLoading } = useAlarms()
  const { systemInfo, connected } = useSystemInfo()
  const { isConnected: realtimeConnected, lastUpdate } = useRealTimeUpdates()

  // Calculate real stats from API data
  const totalCameras = cameras.length
  const onlineCameras = cameras.filter(c => c.status.toLowerCase() === 'online').length
  const offlineCameras = totalCameras - onlineCameras
  const activeAlarms = alarms.filter(a => a.type !== 'resolved').length
  
  // Only show stats for data we actually have from the API
  const stats = [
    {
      title: 'Total Cameras',
      value: camerasLoading ? '...' : totalCameras.toString(),
      change: totalCameras > 0 ? `${totalCameras} devices` : 'No devices',
      changeType: totalCameras > 0 ? 'positive' as const : 'neutral' as const,
      icon: Camera,
    },
    {
      title: 'Online Cameras', 
      value: camerasLoading ? '...' : onlineCameras.toString(),
      change: `${offlineCameras} offline`,
      changeType: offlineCameras === 0 ? 'positive' as const : 'warning' as const,
      icon: Activity,
    },
    {
      title: 'Active Alarms',
      value: alarmsLoading ? '...' : activeAlarms.toString(),
      change: activeAlarms === 0 ? 'All clear' : 'Needs attention',
      changeType: activeAlarms === 0 ? 'positive' as const : 'negative' as const,
      icon: AlertTriangle,
    },
    {
      title: 'System Status',
      value: connected ? 'Online' : 'Offline',
      change: connected ? 'Connected' : 'Check connection',
      changeType: connected ? 'positive' as const : 'negative' as const,
      icon: Database,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <div className="flex items-center space-x-4 text-sm">
          {/* Nx Witness Connection */}
          <div className="flex items-center space-x-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-600" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-600" />
            )}
            <span className={connected ? 'text-green-600' : 'text-red-600'}>
              Nx Witness {connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {/* Real-time Updates */}
          <div className="flex items-center space-x-2 text-gray-600">
            <div className={`w-2 h-2 rounded-full ${
              realtimeConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            <span>Real-time updates</span>
            {lastUpdate && (
              <span className="text-xs text-gray-500">
                (Last: {lastUpdate.toLocaleTimeString()})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </div>

      {/* Connection Status - Full Width */}
      <ConnectionStatusWidget className="mb-4" />

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-1">
          <SystemStatusWidget />
        </div>
        <div className="xl:col-span-1">
          <APIStatusWidget />
        </div>
        <div className="xl:col-span-2">
          <CameraStatusGrid />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentAlarmsWidget />
        <StorageWidget />
      </div>
    </div>
  )
}