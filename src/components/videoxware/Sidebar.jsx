import React, { useState } from 'react';
import { 
  Zap, 
  LayoutDashboard, 
  Camera, 
  TestTube, 
  Cloud, 
  Bell, 
  Calculator, 
  ShieldCheck, 
  Archive, 
  FileText,
  ChevronLeft,
  ChevronRight,
  User,
  Wifi,
  WifiOff
} from 'lucide-react';

export default function Sidebar({ activeTab, onTabChange, health }) {
  const [collapsed, setCollapsed] = useState(false);
  const isOnline = health?.status === 'ok';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'cameras', label: 'Camera Explorer', icon: Camera },
    { id: 's3test', label: 'S3 Bucket Tester', icon: TestTube },
    { id: 'nxcloud', label: 'Nx Cloud Hotware', icon: Cloud, highlight: true },
    { id: 'nxevents', label: 'Nx Event Matrix', icon: Bell },
    { id: 'calculator', label: 'Retention Calculator', icon: Calculator },
    { id: 'verifier', label: 'Archive Verifier', icon: ShieldCheck },
    { id: 'diagnostics', label: 'Reports & Diagnostics', icon: Archive },
    { id: 'parser', label: 'Log Parser', icon: FileText },
  ];

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Sidebar Header / Logo */}
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <div className="logo-icon">
            <Zap size={20} />
          </div>
          {!collapsed && (
            <div className="brand-text">
              <div className="brand-title">VideoXware</div>
              <div className="brand-subtitle">S3 Storage Admin</div>
            </div>
          )}
        </div>

        <button 
          className="collapse-btn" 
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation List */}
      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar-item ${isActive ? 'active' : ''} ${item.highlight ? 'highlight-item' : ''}`}
              onClick={() => onTabChange(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="sidebar-icon" />
              {!collapsed && <span className="sidebar-label">{item.label}</span>}
              {isActive && !collapsed && <div className="active-indicator" />}
            </button>
          );
        })}
      </nav>

      {/* Sidebar Footer / User Profile */}
      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">
            <User size={16} />
          </div>
          {!collapsed && (
            <div className="user-info">
              <div className="user-name">VideoXware Admin</div>
              <div className={`user-status ${isOnline ? 'online' : 'offline'}`}>
                {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
                {isOnline ? 'Live Connection' : 'Offline'}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
