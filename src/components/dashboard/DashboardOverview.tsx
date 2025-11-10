'use client'

import { Camera, Activity, AlertTriangle, Database, TrendingUp, Users } from 'lucide-react'
import StatsCard from '@/components/ui/StatsCard'
import SystemStatusWidget from '@/components/widgets/SystemStatusWidget'
import CameraStatusGrid from '@/components/widgets/CameraStatusGrid'
import RecentAlarmsWidget from '@/components/widgets/RecentAlarmsWidget'
import StorageWidget from '@/components/widgets/StorageWidget'

export default function DashboardOverview() {
  const stats = [
    {
      title: 'Total Cameras',
      value: '248',
      change: '+12',
      changeType: 'positive' as const,
      icon: Camera,
    },
    {
      title: 'Online Cameras',
      value: '236',
      change: '+2',
      changeType: 'positive' as const,
      icon: Activity,
    },
    {
      title: 'Active Alarms',
      value: '3',
      change: '-5',
      changeType: 'negative' as const,
      icon: AlertTriangle,
    },
    {
      title: 'Storage Usage',
      value: '78.5%',
      change: '+2.3%',
      changeType: 'neutral' as const,
      icon: Database,
    },
    {
      title: 'Daily Events',
      value: '1,247',
      change: '+156',
      changeType: 'positive' as const,
      icon: TrendingUp,
    },
    {
      title: 'Active Users',
      value: '23',
      change: '+3',
      changeType: 'positive' as const,
      icon: Users,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span>Real-time updates</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {stats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </div>

      {/* Widgets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <SystemStatusWidget />
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