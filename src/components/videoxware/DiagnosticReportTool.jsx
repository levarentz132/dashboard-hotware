import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  Send, 
  Check, 
  Copy, 
  Mail, 
  Archive, 
  ShieldCheck, 
  AlertOctagon,
  Clock,
  Settings
} from 'lucide-react';
import { exportDiagnosticBundle, generateCoverageReport } from '@/lib/videoXwareApi';

export default function DiagnosticReportTool({ currentStatus, logs }) {
  const [reportText, setReportText] = useState(() => generateCoverageReport(currentStatus));
  const [copied, setCopied] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleRefreshReport = () => {
    setReportText(generateCoverageReport(currentStatus));
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportDiagnostics = () => {
    exportDiagnosticBundle(currentStatus, logs);
  };

  const handleSendNightlyReport = () => {
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Archive size={24} style={{ color: 'var(--purple)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Coverage Reporting & Support Diagnostics</h2>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Generate scheduled nightly coverage reports confirming footage integrity or bundle logs & metrics into a support ZIP/JSON package (simulating <code>collect_diagnostics.ps1</code>).
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button 
              className="btn-icon"
              onClick={handleExportDiagnostics}
              style={{ background: 'var(--purple)', color: 'white', fontWeight: 600, padding: '0.6rem 1.2rem', borderRadius: '8px' }}
            >
              <Download size={16} />
              Export Bundle (collect_diagnostics.ps1)
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Nightly Report Generator & Diagnostic Exporter */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Scheduled Nightly Email Report Generator */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mail size={18} style={{ color: 'var(--cyan)' }} />
              Scheduled Nightly Coverage Report
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-icon" onClick={handleRefreshReport} title="Refresh Report text">
                <Clock size={14} />
              </button>
              <button className="btn-icon" onClick={handleCopyReport} title="Copy Markdown">
                {copied ? <Check size={14} style={{ color: 'var(--emerald)' }} /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          <pre style={{ 
            flex: 1,
            background: '#090d16', 
            padding: '1rem', 
            borderRadius: '10px', 
            border: '1px solid var(--border-subtle)', 
            fontFamily: 'var(--font-mono)', 
            fontSize: '0.8rem',
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '380px',
            overflowY: 'auto'
          }}>
            {reportText}
          </pre>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Scheduled Time: <strong>Nightly at 00:00 AM</strong>
            </span>
            <button 
              className="btn-icon" 
              onClick={handleSendNightlyReport}
              style={{ background: 'var(--emerald)', color: 'white', fontWeight: 600, padding: '0.5rem 1rem', borderRadius: '6px' }}
            >
              {emailSent ? <Check size={14} /> : <Send size={14} />}
              {emailSent ? 'Report Sent!' : 'Send Test Email Now'}
            </button>
          </div>
        </div>

        {/* Right Column: Technical Support Diagnostics Info */}
        <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings size={18} style={{ color: 'var(--purple)' }} />
            Support Diagnostics (collect_diagnostics.ps1)
          </h3>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
            If any unexpected behavior, network dropouts, or S3 bucket permission errors require engineering escalation, click below to generate the complete diagnostic ZIP/JSON package.
          </p>

          <div style={{ background: 'rgba(15,23,42,0.6)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--purple)' }}>
              Bundle Contents Included:
            </div>
            <ul style={{ fontSize: '0.8rem', color: 'var(--text-main)', paddingLeft: '1.2rem', lineHeight: '1.6' }}>
              <li>Current Server Health & Cloud Online Status</li>
              <li>Operational Counters (Uploaded, Failed, Retried, Dropped)</li>
              <li>Local Cache Usage & Watermark Thresholds</li>
              <li>Active Server Profiles & S3 Base Endpoints</li>
              <li>Last 50 Log Entries (videoxware_s3_storage.log)</li>
            </ul>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
            <button 
              className="btn-icon"
              onClick={handleExportDiagnostics}
              style={{ width: '100%', justifyContent: 'center', background: 'var(--purple)', color: 'white', fontWeight: 600, padding: '0.75rem', borderRadius: '8px', gap: '0.5rem' }}
            >
              <Download size={16} />
              Download Diagnostic Package (.JSON)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
