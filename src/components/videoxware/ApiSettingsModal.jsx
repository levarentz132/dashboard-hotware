import React, { useState } from 'react';
import { X, Check, Globe, HelpCircle, Cpu, Cloud } from 'lucide-react';
import { getBaseUrl, setBaseUrl, isMockMode, setMockMode, getNxCloudUrl, setNxCloudUrl } from '@/lib/videoXwareApi';

export default function ApiSettingsModal({ isOpen, onClose, onSave }) {
  if (!isOpen) return null;

  const [urlInput, setUrlInput] = useState(getBaseUrl());
  const [mockEnabled, setMockEnabled] = useState(isMockMode());
  const [nxCloudInput, setNxCloudInput] = useState(getNxCloudUrl());

  const handleSave = () => {
    setBaseUrl(urlInput);
    setMockMode(mockEnabled);
    setNxCloudUrl(nxCloudInput);
    onSave();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe size={22} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>VideoXware API Configuration</h3>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ padding: '0.35rem 0.5rem' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Mode Switcher */}
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Use Simulated Mock API</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Generate realistic data matching VideoXware schema offline</div>
              </div>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={mockEnabled} 
                  onChange={(e) => setMockEnabled(e.target.checked)}
                  style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                />
              </label>
            </div>
          </div>

          {/* VideoXware Endpoint URL */}
          <div>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              VideoXware Dashboard Base URL
            </label>
            <input 
              type="text" 
              className="input-field"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://127.0.0.1:8765/<token>/"
              disabled={mockEnabled}
            />
            <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <HelpCircle size={14} />
              Read from file: <code>&lt;plugin-dir&gt;\videoxware_s3_storage\dashboard.url</code>
            </div>
          </div>

          {/* Nx Cloud Hotware URL */}
          <div style={{ background: 'rgba(15, 23, 42, 0.7)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.25)' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
              <Cloud size={15} />
              Nx Cloud Hotware Dashboard URL
            </label>
            <input
              type="text"
              className="input-field"
              value={nxCloudInput}
              onChange={(e) => setNxCloudInput(e.target.value)}
              placeholder="http://localhost:3081/"
            />
            <div style={{ fontSize: '0.775rem', color: 'var(--text-dim)', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <HelpCircle size={14} />
              Default: <code>http://localhost:3081/</code> — Nx Cloud Hotware local dev server. URL disimpan lokal, tidak dikirim ke server manapun.
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button className="btn-icon" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Check size={16} />
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
