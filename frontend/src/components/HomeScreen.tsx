import { useState } from 'react'
import { MarkWireframe, Wordmark } from '../ui/Logo'
import { OsIcon } from '../ui/OsIcon'
import { useConnections } from '../store/connections'

interface Props {
  onSelect: (id: string) => void
  onNew: () => void
  onLocalTerminal?: () => void
  connectedHostId?: string | null
}

export const HomeScreen = ({ onSelect, onNew, onLocalTerminal, connectedHostId }: Props) => {
  const { connections } = useConnections()
  const [q, setQ] = useState('')

  const recent = connections.slice(0, 9)

  const filtered = q.trim()
    ? connections.filter(h =>
        h.name.toLowerCase().includes(q.toLowerCase()) ||
        h.host.toLowerCase().includes(q.toLowerCase()) ||
        h.user.toLowerCase().includes(q.toLowerCase())
      )
    : recent

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-2)', padding: 40, overflow: 'auto',
    }}>
      <div style={{ width: '100%', maxWidth: 680 }}>

        {/* Logo + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <MarkWireframe size={52} color="var(--text-1)" />
            <Wordmark size={32} color="var(--text-1)" />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={onLocalTerminal} icon="⊞" label="Start local terminal" />
          {connectedHostId && (
            <Btn onClick={() => onSelect(connectedHostId)} icon="↩" label="Return to active session" />
          )}
          <Btn onClick={onNew} icon="+" label="New connection" primary />
        </div>

        {/* Search */}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Find existing session or server name…"
          style={{
            width: '100%', height: 40, padding: '0 16px',
            background: 'var(--bg-1)', border: '1px solid var(--border)',
            borderRadius: 7, color: 'var(--text-1)', fontSize: 13,
            outline: 'none', marginBottom: 24, boxSizing: 'border-box',
          }}
          onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-2)'}
          onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
        />

        {/* Session grid */}
        {connections.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              {q ? 'Search results' : 'Recent sessions'}
            </div>
            {filtered.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13, padding: 20 }}>No sessions found</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {filtered.map(h => (
                  <button key={h.id} onDoubleClick={() => onSelect(h.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: 'var(--bg-1)', border: '1px solid var(--border)',
                      borderRadius: 7, color: 'var(--text-1)', cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}><OsIcon os={h.os_type} size={13} />{h.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {h.user}@{h.host}
                      </div>
                    </div>
                    {h.latency != null && (
                      <span style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{h.latency}ms</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {connections.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-4)', fontSize: 13, padding: 20 }}>
            No saved sessions yet. Click "New connection" to add your first server.
          </div>
        )}
      </div>
    </div>
  )
}

function Btn({ onClick, icon, label, primary }: { onClick?: () => void; icon: string; label: string; primary?: boolean }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
      background: primary ? 'var(--text-1)' : 'var(--bg-1)',
      border: `1px solid ${primary ? 'var(--text-1)' : 'var(--border)'}`,
      borderRadius: 7, color: primary ? 'var(--bg-1)' : 'var(--text-1)',
      fontSize: 13, cursor: 'pointer', fontWeight: primary ? 600 : 500,
    }}
      onMouseEnter={e => { if (!primary) (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)' }}
      onMouseLeave={e => { if (!primary) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
      <span style={{ fontSize: 15 }}>{icon}</span> {label}
    </button>
  )
}
