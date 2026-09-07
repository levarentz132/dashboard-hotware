import React, { useState } from 'react';
import { Terminal, AlertCircle, AlertTriangle, Filter } from 'lucide-react';

export default function LogsViewer({ logs, levelFilter, onFilterChange }) {
  if (!logs) return null;

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div className="section-bar">
        <div className="section-title">
          <Terminal size={20} style={{ color: 'var(--amber)' }} />
          Recent Plugin Logs (`/api/log`)
        </div>

        {/* Filter level selector */}
        <div className="range-selector">
          <button 
            className={`range-btn ${levelFilter === 'all' ? 'active' : ''}`}
            onClick={() => onFilterChange('all')}
          >
            All Logs
          </button>
          <button 
            className={`range-btn ${levelFilter === 'warn' ? 'active' : ''}`}
            onClick={() => onFilterChange('warn')}
          >
            Warnings
          </button>
          <button 
            className={`range-btn ${levelFilter === 'error' ? 'active' : ''}`}
            onClick={() => onFilterChange('error')}
          >
            Errors Only
          </button>
        </div>
      </div>

      <div className="logs-table-container" style={{ marginTop: '1rem' }}>
        {logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No logs recorded for filter level "{levelFilter}".
          </div>
        ) : (
          <table className="logs-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Time</th>
                <th>Component</th>
                <th>Log Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, idx) => {
                const isError = log.level === 'error';
                const timeStr = log.tMs ? new Date(log.tMs).toLocaleTimeString() : 'N/A';
                return (
                  <tr key={log.id || idx}>
                    <td>
                      <span className={isError ? 'log-level-error' : 'log-level-warn'}>
                        {isError ? <AlertCircle size={12} style={{ display: 'inline', marginRight: 4 }} /> : <AlertTriangle size={12} style={{ display: 'inline', marginRight: 4 }} />}
                        {log.level.toUpperCase()}
                      </span>
                    </td>
                    <td className="log-time">{timeStr}</td>
                    <td style={{ fontWeight: 600, color: 'var(--cyan)' }}>{log.component || 'StoragePlugin'}</td>
                    <td style={{ color: '#e2e8f0' }}>{log.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
