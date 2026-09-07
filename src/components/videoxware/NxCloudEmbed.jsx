import React, { useState } from 'react';
import {
  Globe,
  ExternalLink,
  Settings,
  Shield,
  Cloud,
  RefreshCw,
  Copy,
  Check,
  Maximize2,
  Lock,
  ArrowUpRight
} from 'lucide-react';
import { getNxCloudUrl } from '@/lib/videoXwareApi';

export default function NxCloudEmbed({ onOpenSettings }) {
  const nxCloudUrl = getNxCloudUrl();
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLaunchNewTab = () => {
    window.open(nxCloudUrl, '_blank', 'noopener,noreferrer');
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(nxCloudUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleReload = () => {
    setIframeLoaded(false);
    setIframeError(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Sleek Header Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          
          {/* Title & Gateway Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #38bdf8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#000',
              boxShadow: '0 0 20px rgba(56, 189, 248, 0.3)',
              flexShrink: 0
            }}>
              <Cloud size={22} />
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>Nx Cloud Hotware Portal</h2>
                <span className="badge badge-online" style={{ fontSize: '0.72rem', padding: '0.2rem 0.55rem' }}>
                  <span className="pulse-dot"></span> Gateway Active
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                <Globe size={13} style={{ color: '#38bdf8' }} />
                <code>{nxCloudUrl}</code>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              className="btn-icon"
              onClick={handleCopyUrl}
              title="Copy Target URL"
              style={{ fontSize: '0.82rem', padding: '0.5rem 0.8rem' }}
            >
              {copied ? <Check size={14} style={{ color: '#34d399' }} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>

            <button
              className="btn-icon"
              onClick={onOpenSettings}
              title="Configure Target URL"
              style={{ fontSize: '0.82rem', padding: '0.5rem 0.8rem' }}
            >
              <Settings size={14} />
              URL Config
            </button>

            <button
              onClick={handleLaunchNewTab}
              style={{
                padding: '0.55rem 1.1rem',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
                color: '#000',
                fontWeight: 700,
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 4px 15px rgba(56, 189, 248, 0.3)',
                transition: 'transform 0.15s ease, opacity 0.15s ease'
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <ArrowUpRight size={16} />
              Open Full Portal
            </button>
          </div>

        </div>
      </div>

      {/* Embedded Portal Browser Frame */}
      <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
        
        {/* Browser Mockup Top Bar */}
        <div style={{
          background: 'rgba(15, 23, 42, 0.95)',
          padding: '0.7rem 1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          {/* Traffic light dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: '60px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#eab308', display: 'inline-block' }}></span>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#22c55e', display: 'inline-block' }}></span>
          </div>

          {/* Address Bar */}
          <div style={{
            flex: 1,
            maxWidth: '520px',
            background: 'rgba(9, 13, 22, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '0.35rem 0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
          }}>
            <Lock size={12} style={{ color: '#34d399' }} />
            <span style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nxCloudUrl}
            </span>
          </div>

          {/* Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              className="btn-icon"
              onClick={handleReload}
              title="Reload Frame"
              style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
            >
              <RefreshCw size={13} className={!iframeLoaded && !iframeError ? 'spin' : ''} />
            </button>
            <button
              className="btn-icon"
              onClick={handleLaunchNewTab}
              title="Open in New Tab"
              style={{ padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}
            >
              <ExternalLink size={13} />
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {!iframeLoaded && !iframeError && (
          <div style={{
            height: '620px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            background: 'rgba(9, 13, 22, 0.95)',
            color: 'var(--text-muted)'
          }}>
            <RefreshCw size={28} className="spin" style={{ color: '#38bdf8' }} />
            <div style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>Loading Nx Cloud Hotware Portal...</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>Connecting to <code>{nxCloudUrl}</code></div>
          </div>
        )}

        {/* Error Fallback (if frame is blocked by browser/X-Frame-Options) */}
        {iframeError && (
          <div style={{
            height: '500px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.25rem',
            background: 'rgba(9, 13, 22, 0.95)',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8'
            }}>
              <ExternalLink size={26} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.4rem' }}>
                Open Portal in New Tab
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px' }}>
                Access the Nx Cloud Hotware Dashboard directly in your browser tab for the best experience.
              </p>
            </div>

            <button
              onClick={handleLaunchNewTab}
              style={{
                padding: '0.7rem 1.4rem',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
                color: '#000',
                fontWeight: 700,
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 20px rgba(56, 189, 248, 0.3)'
              }}
            >
              <ArrowUpRight size={18} />
              Open Nx Cloud Hotware (`http://localhost:3081/`)
            </button>
          </div>
        )}

        {/* Live Portal iFrame */}
        <iframe
          key={nxCloudUrl}
          src={nxCloudUrl}
          title="Nx Cloud Hotware Dashboard"
          style={{
            width: '100%',
            height: '750px',
            border: 'none',
            background: '#090d16',
            display: iframeLoaded && !iframeError ? 'block' : 'none'
          }}
          onLoad={() => setIframeLoaded(true)}
          onError={() => { setIframeError(true); setIframeLoaded(false); }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        />

      </div>

      {/* Footer Security Badge */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.75rem 1.25rem',
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '10px',
        fontSize: '0.8rem',
        color: 'var(--text-muted)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Shield size={14} style={{ color: '#34d399' }} />
          <span>Zero-Touch Security • Localhost Connection Active</span>
        </div>
        <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem' }}>Target: {nxCloudUrl}</span>
      </div>

    </div>
  );
}
