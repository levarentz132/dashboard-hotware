'use client'

import { useState } from 'react'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import DashboardOverview from '@/components/dashboard/DashboardOverview'
import CameraInventory from '@/components/cameras/CameraInventory'
import SystemHealth from '@/components/monitoring/SystemHealth'
import AlarmConsole from '@/components/alarms/AlarmConsole'
import Analytics from '@/components/analytics/Analytics'

export default function Home() {
  const [activeSection, setActiveSection] = useState('dashboard')

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <DashboardOverview />
      case 'cameras':
        return <CameraInventory />
      case 'health':
        return <SystemHealth />
      case 'alarms':
        return <AlarmConsole />
      case 'analytics':
        return <Analytics />
      default:
        return <DashboardOverview />
    }
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          {renderContent()}
        </main>
      </div>
    </div>
  )
}