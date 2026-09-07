import React, { useState } from 'react';
import { Server, Plus, Trash2, Check, ChevronDown } from 'lucide-react';
import { getServerProfiles, saveServerProfiles, getActiveServer, setActiveServerId } from '@/lib/videoXwareApi';

export default function ServerSelector({ onServerChange }) {
  const [servers, setServers] = useState(getServerProfiles());
  const [activeServer, setActiveServer] = useState(getActiveServer());
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const handleSelectServer = (srv) => {
    setActiveServer(srv);
    setActiveServerId(srv.id);
    setIsOpen(false);
    onServerChange(srv);
  };

  const handleAddServer = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    let cleanUrl = newUrl.trim();
    if (!cleanUrl.endsWith('/')) cleanUrl += '/';

    const newSrv = {
      id: `srv-${Date.now()}`,
      name: newName.trim(),
      url: cleanUrl
    };

    const updated = [...servers, newSrv];
    setServers(updated);
    saveServerProfiles(updated);
    setNewName('');
    setNewUrl('');
    setIsAdding(false);
    handleSelectServer(newSrv);
  };

  const handleDeleteServer = (e, srvId) => {
    e.stopPropagation();
    if (servers.length <= 1) return;
    const updated = servers.filter(s => s.id !== srvId);
    setServers(updated);
    saveServerProfiles(updated);
    if (activeServer.id === srvId) {
      handleSelectServer(updated[0]);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        className="btn-icon"
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderColor: 'var(--border-glow)', background: 'rgba(15, 23, 42, 0.8)' }}
      >
        <Server size={16} style={{ color: 'var(--primary)' }} />
        <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeServer.name}
        </span>
        <ChevronDown size={14} />
      </button>

      {isOpen && (
        <div 
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '110%',
            left: 0,
            width: '300px',
            padding: '0.75rem',
            zIndex: 60,
            background: 'rgba(9, 13, 22, 0.95)'
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '0.5rem', uppercase: 'true' }}>
            Media Server Node Selector
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
            {servers.map((srv) => {
              const isSel = srv.id === activeServer.id;
              return (
                <div
                  key={srv.id}
                  onClick={() => handleSelectServer(srv)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    background: isSel ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    border: isSel ? '1px solid var(--primary)' : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                    {isSel ? <Check size={14} style={{ color: 'var(--primary)' }} /> : <Server size={14} style={{ color: 'var(--text-dim)' }} />}
                    <div>
                      <div style={{ fontWeight: isSel ? 700 : 500, color: '#f3f4f6' }}>{srv.name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{srv.url}</div>
                    </div>
                  </div>

                  {servers.length > 1 && (
                    <button 
                      onClick={(e) => handleDeleteServer(e, srv.id)}
                      style={{ background: 'transparent', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '0.2rem' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Server */}
          {isAdding ? (
            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-subtle)' }}>
              <input 
                type="text"
                placeholder="Server Name (e.g. Node Jakarta)"
                className="input-field"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', marginBottom: '0.4rem' }}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input 
                type="text"
                placeholder="http://127.0.0.1:8765/<token>/"
                className="input-field"
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', marginBottom: '0.5rem' }}
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className="btn-primary" style={{ flex: 1, padding: '0.35rem', fontSize: '0.8rem' }} onClick={handleAddServer}>
                  Save
                </button>
                <button className="btn-icon" style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setIsAdding(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button 
              className="btn-icon" 
              style={{ width: '100%', marginTop: '0.5rem', justifyContent: 'center', fontSize: '0.8rem' }}
              onClick={() => setIsAdding(true)}
            >
              <Plus size={14} />
              Add Server Node
            </button>
          )}
        </div>
      )}
    </div>
  );
}
