import React from 'react';
import { 
  Settings, 
  RefreshCw, 
  Activity, 
  Wifi, 
  WifiOff, 
  Download,
  Maximize2
} from 'lucide-react';
import ServerSelector from './ServerSelector';

export default function Header({ 
  health, 
  isMock, 
  isRefreshing, 
  onRefresh, 
  onOpenSettings,
  onOpenExport,
  refreshInterval,
  onRefreshIntervalChange,
  onServerChange
}) {
  const isOnline = health?.status === 'ok';

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  return (
    <header className="app-top-header">
      {/* Top Header Left: Server Selector & Status Badges */}
      <div className="top-header-left">
        <ServerSelector onServerChange={onServerChange} />

        {/* Liveness badge */}
        <div className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
          <span className="pulse-dot"></span>
          {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
          {isOnline ? 'System Live' : 'System Offline'}
        </div>

        {/* Mock Mode badge */}
        {isMock && (
          <div className="badge badge-mock" title="Running in simulated mock API mode">
            <Activity size={13} />
            Mock Mode
          </div>
        )}
      </div>

      {/* Top Header Right: Action Controls */}
      <div className="top-header-right">
        {/* Dynamic Auto-Refresh interval selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <select 
            value={refreshInterval}
            onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
            className="btn-icon"
            style={{ padding: '0.45rem 0.6rem', fontSize: '0.8rem', background: 'rgba(15, 23, 42, 0.8)' }}
            title="Auto Refresh Rate"
          >
            <option value={0}>Auto: OFF</option>
            <option value={15000}>Auto: 15s</option>
            <option value={30000}>Auto: 30s</option>
            <option value={60000}>Auto: 60s</option>
            <option value={300000}>Auto: 300s (Default)</option>
          </select>
        </div>

        {/* Refresh button */}
        <button 
          className="btn-icon" 
          onClick={onRefresh}
          disabled={isRefreshing}
          title="Refresh Data Now"
        >
          <RefreshCw size={15} className={isRefreshing ? 'spin' : ''} />
        </button>

        {/* Export button */}
        <button className="btn-icon" onClick={onOpenExport} title="Export CSV / JSON Report">
          <Download size={15} />
          <span>Export</span>
        </button>

        {/* Full Screen Toggle */}
        <button className="btn-icon" onClick={toggleFullScreen} title="Toggle Full Screen">
          <Maximize2 size={15} />
          <span>Full Screen</span>
        </button>

        {/* Settings button */}
        <button className="btn-icon" onClick={onOpenSettings} title="API Settings">
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
}
