import React, { useState } from 'react';
import { 
  Activity, 
  AlertTriangle, 
  AlertOctagon, 
  CheckCircle2, 
  Bell, 
  Copy, 
  Check, 
  Layers, 
  Info,
  Server,
  Mail,
  ShieldAlert
} from 'lucide-react';
import { getNxDiagnosticEvents } from '@/lib/videoXwareApi';

export default function NxEventLogTool({ currentStatus }) {
  const [copiedRuleId, setCopiedRuleId] = useState(null);
  const [levelFilter, setLevelFilter] = useState('all');

  const events = getNxDiagnosticEvents(currentStatus || {});

  const filteredEvents = levelFilter === 'all' 
    ? events 
    : events.filter(e => e.level.toLowerCase() === levelFilter.toLowerCase());

  const handleCopyRule = (ruleId, text) => {
    navigator.clipboard.writeText(text);
    setCopiedRuleId(ruleId);
    setTimeout(() => setCopiedRuleId(null), 2500);
  };

  const sampleRules = [
    {
      id: 'rule-01',
      title: 'Cloud Offline & Emergency Data Loss Rule',
      trigger: 'Event Type: Integration Diagnostic Event (Cloud Offline OR Files Dropped)',
      action: 'Send e-mail to Security Admin & Show Desktop Notification with Siren sound',
      description: 'Triggers an immediate alarm whenever Wasabi S3 becomes unreachable or files are evicted from cache.'
    },
    {
      id: 'rule-02',
      title: 'Upload Stalled & High Queue Warning Rule',
      trigger: 'Event Type: Integration Diagnostic Event (Upload Stalled OR Queue Growing)',
      action: 'Show Desktop Notification to Operator',
      description: 'Alerts operators when upload speed drops to 0 Mbps or queue backlog exceeds 500 MB.'
    },
    {
      id: 'rule-03',
      title: 'Cache Capacity 85%/95% Rule',
      trigger: 'Event Type: Integration Diagnostic Event (Cache High OR Cache Critical)',
      action: 'Send e-mail to IT Infrastructure Team',
      description: 'Triggers when local cache disk space usage exceeds 85% or 95% threshold.'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Activity size={24} style={{ color: 'var(--cyan)' }} />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Nx Witness Integration Diagnostic Event Matrix</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
          The VideoXware S3 Plugin pushes state-change diagnostic events to the <strong>Nx Witness Event Log</strong> every 30 seconds. Operators can build custom Event Rules in Nx Client based on these diagnostic states.
        </p>
      </div>

      {/* Cluster Note Callout Banner */}
      <div className="glass-panel" style={{ padding: '1rem 1.25rem', borderColor: 'var(--purple)', background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Info size={20} style={{ color: 'var(--purple)', flexShrink: 0 }} />
        <div style={{ fontSize: '0.85rem', color: '#c4b5fd', lineHeight: '1.5' }}>
          <strong>Nx Cluster Behavior Note:</strong> Monitor plugin diagnostic events are visible when the Nx Client connects directly to the server hosting the VideoXware plugin. This is standard Nx cluster event architecture.
        </div>
      </div>

      {/* Diagnostic Event Log Feed */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} style={{ color: 'var(--primary)' }} />
            Live 30-Second Diagnostic Event Feed
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Filter Level:</span>
            <div className="range-selector">
              {['all', 'info', 'warning', 'error'].map((lvl) => (
                <button
                  key={lvl}
                  className={`range-btn ${levelFilter === lvl ? 'active' : ''}`}
                  onClick={() => setLevelFilter(lvl)}
                >
                  {lvl.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Event List Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Event Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Severity Level</th>
                <th style={{ padding: '0.75rem 1rem' }}>Source Engine</th>
                <th style={{ padding: '0.75rem 1rem' }}>Description & Diagnostic Details</th>
                <th style={{ padding: '0.75rem 1rem' }}>Recommended Nx Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((evt) => {
                const isErr = evt.level === 'Error';
                const isWarn = evt.level === 'Warning';
                const levelColor = isErr ? '#fb7185' : isWarn ? '#fde68a' : '#34d399';
                const badgeBg = isErr ? 'rgba(244, 63, 94, 0.15)' : isWarn ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)';

                return (
                  <tr key={evt.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'white' }}>
                      {evt.eventType}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <span className="badge" style={{ background: badgeBg, color: levelColor, borderColor: levelColor, fontSize: '0.75rem' }}>
                        {isErr ? <AlertOctagon size={12} /> : isWarn ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />}
                        {evt.level}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-dim)' }}>
                      <code>{evt.source}</code>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--text-main)', maxWidth: '360px' }}>
                      {evt.description}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', color: evt.nxRuleRecommended ? 'var(--cyan)' : 'var(--text-muted)' }}>
                      {evt.action}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Nx Event Rules Guide & Configuration Templates */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Bell size={18} style={{ color: 'var(--amber)' }} />
          Nx Client Event Rule Setup Guide & Templates
        </h3>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: '1.5' }}>
          To trigger automatic email alerts or desktop popups in Nx Witness, open <strong>System Administration $\rightarrow$ Event Rules</strong> in Nx Client and add a rule with Event Type set to <em>"Integration Diagnostic Event"</em> (or <em>"Plugin Diagnostic Event"</em> in older Nx builds).
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {sampleRules.map((rule) => (
            <div 
              key={rule.id}
              style={{
                background: 'rgba(15,23,42,0.6)',
                padding: '1.25rem',
                borderRadius: '12px',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--cyan)', marginBottom: '0.5rem' }}>
                  {rule.title}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: '1.4' }}>
                  {rule.description}
                </p>
                <div style={{ fontSize: '0.8rem', color: 'white', marginBottom: '0.4rem' }}>
                  <strong>Trigger:</strong> <code style={{ color: '#fde68a' }}>{rule.trigger}</code>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'white', marginBottom: '0.75rem' }}>
                  <strong>Action:</strong> <code style={{ color: '#a7f3d0' }}>{rule.action}</code>
                </div>
              </div>

              <button 
                className="btn-icon"
                onClick={() => handleCopyRule(rule.id, `${rule.title}\nTrigger: ${rule.trigger}\nAction: ${rule.action}`)}
                style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', padding: '0.5rem', marginTop: '0.5rem' }}
              >
                {copiedRuleId === rule.id ? <Check size={14} style={{ color: 'var(--emerald)' }} /> : <Copy size={14} />}
                {copiedRuleId === rule.id ? 'Copied Template!' : 'Copy Rule Config'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
