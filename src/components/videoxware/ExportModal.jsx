import React from 'react';
import { Download, FileSpreadsheet, FileJson, X } from 'lucide-react';
import { exportToCsv, exportToJson } from '@/lib/videoXwareApi';

export default function ExportModal({ isOpen, onClose, currentStatus, samples, logs }) {
  if (!isOpen) return null;

  const handleExportCsv = (type) => {
    const timestamp = new Date().toISOString().slice(0, 10);
    if (type === 'metrics') {
      const rows = samples && samples.length ? samples : [currentStatus];
      exportToCsv(`videoxware_metrics_${timestamp}.csv`, rows);
    } else if (type === 'logs') {
      exportToCsv(`videoxware_logs_${timestamp}.csv`, logs || []);
    }
    onClose();
  };

  const handleExportJson = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    const fullData = {
      exportTime: new Date().toISOString(),
      currentStatus,
      samples,
      logs
    };
    exportToJson(`videoxware_report_${timestamp}.json`, fullData);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Download size={22} style={{ color: 'var(--cyan)' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Export Audit Report</h3>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ padding: '0.35rem 0.5rem' }}>
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
          Select your preferred export format to generate reports for management or auditing.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button 
            className="btn-icon"
            style={{ width: '100%', padding: '0.85rem', justifyContent: 'flex-start', background: 'rgba(6, 182, 212, 0.1)', borderColor: 'rgba(6, 182, 212, 0.3)' }}
            onClick={() => handleExportCsv('metrics')}
          >
            <FileSpreadsheet size={20} style={{ color: 'var(--cyan)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: '#f3f4f6' }}>Export Metrics History (CSV)</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>Export time-series metrics samples for Excel / Google Sheets</div>
            </div>
          </button>

          <button 
            className="btn-icon"
            style={{ width: '100%', padding: '0.85rem', justifyContent: 'flex-start', background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
            onClick={() => handleExportCsv('logs')}
          >
            <FileSpreadsheet size={20} style={{ color: 'var(--amber)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: '#f3f4f6' }}>Export Error Logs (CSV)</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>Export warning and error log entries for auditing</div>
            </div>
          </button>

          <button 
            className="btn-icon"
            style={{ width: '100%', padding: '0.85rem', justifyContent: 'flex-start', background: 'rgba(139, 92, 246, 0.1)', borderColor: 'rgba(139, 92, 246, 0.3)' }}
            onClick={handleExportJson}
          >
            <FileJson size={20} style={{ color: 'var(--purple)' }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: '#f3f4f6' }}>Export Full JSON Bundle</div>
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>Export combined status, samples, and logs in standard JSON format</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
