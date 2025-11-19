'use client'

import { Camera, Home, Activity, AlertTriangle, BarChart3, Settings, Users, Database, Server } from 'lucide-react'

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

const navigationItems = [
  { id: 'dashboard', label: 'Dashboard 123', icon: Home },
  { id: 'cameras', label: 'Camera Inventory', icon: Camera },
  { id: 'servers', label: 'Server Options', icon: Server },
  { id: 'health', label: 'System Health', icon: Activity },
  { id: 'alarms', label: 'Alarm Console', icon: AlertTriangle },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'debug', label: 'Connection Debug', icon: Settings },
  { id: 'storage', label: 'Storage', icon: Database },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export default function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  return (
    <div className="w-64 bg-white shadow-lg">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-gray-800">Hotware</h1>
        <p className="text-sm text-gray-600">Camera Dashboard</p>
      </div>
      
      <nav className="mt-6">
        {navigationItems.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`w-full flex items-center px-6 py-3 text-left transition-colors ${
                activeSection === item.id
                  ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </button>
          )
        })}
      </nav>
    </div>
  )
}