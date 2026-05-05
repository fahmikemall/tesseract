import { useEffect, useState } from 'react'
import { I } from '../ui/icons'
import { Button, Tag } from '../ui/primitives'
import { useConnections } from '../store/connections'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 21) return 'Good evening'
  return 'Good night'
}

function timeAgo(date: Date) {
  const s = Math.round((Date.now() - date.getTime()) / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.round(s / 60)}m ago`
}


interface DashboardProps {
  onSelect: (id: string) => void
  onNew: () => void
}

export const Dashboard = ({ onSelect, onNew }: DashboardProps) => {
  const { connections, snippets, systemUser, lastRefresh, refreshing, refreshWithPing } = useConnections()
  const [, setTick] = useState(0)
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null)

  // Update "last refresh X ago" label every 5s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  // Auto-ping on mount, then every 30s
  useEffect(() => {
    refreshWithPing()
    const id = setInterval(() => refreshWithPing(), 30_000)
    return () => clearInterval(id)
  }, [])


  const copySnippet = (cmd: string, name: string) => {
    navigator.clipboard.writeText(cmd).then(() => {
      setCopiedSnippet(name)
      setTimeout(() => setCopiedSnippet(null), 1500)
    }).catch(console.error)
  }

  // Empty state — no connections saved yet
  if (!refreshing && connections.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-2)', gap: 0 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Overview</div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>
            {getGreeting()}, {systemUser.charAt(0).toUpperCase() + systemUser.slice(1)}.
          </h1>
          <p style={{ margin: '0 0 32px', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
            No SSH connections yet.<br />Add your first server to get started.
          </p>
          <Button variant="primary" size="lg" onClick={onNew}>
            <I.Plus size={14} /> New connection
          </Button>
          <div style={{ marginTop: 24, padding: '16px 20px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'left' }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 10, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Quick start</div>
            {[
              { label: 'Add a server', hint: 'Click "New connection" or press Ctrl+N' },
              { label: 'Connect via terminal', hint: 'Click any host in the sidebar' },
              { label: 'Import SSH config', hint: 'Keys from ~/.ssh are auto-detected' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', minWidth: 16 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{item.hint}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const online = connections.filter(h => h.status === 'online').length
  const warn = connections.filter(h => h.status === 'warn').length
  const offline = connections.filter(h => h.status === 'offline').length
  const totalFwd = connections.reduce((s, h) => s + h.fwd, 0)
  const latencyHosts = connections.filter(h => h.latency != null)
  const avgLatency = latencyHosts.length > 0
    ? Math.round(latencyHosts.reduce((s, h) => s + (h.latency ?? 0), 0) / latencyHosts.length)
    : 0

  const groups = [...new Set(connections.map(h => h.group))]
  const pinned = connections.filter(h => h.pinned)

  const stat = (label: string, value: string | number, sub?: string) => (
    <div style={{ flex: 1, padding: '16px 18px', borderRight: '1px solid var(--border)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--text-1)', lineHeight: 1, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{sub}</div>}
      </div>
    </div>
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-2)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 28px 48px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>Overview</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>
              {getGreeting()}, {systemUser.charAt(0).toUpperCase() + systemUser.slice(1)}.
            </h1>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{online} of {connections.length} hosts reachable</span>
              <span style={{ color: 'var(--text-4)' }}>·</span>
              {refreshing
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><I.Refresh size={11} style={{ animation: 'spin 1s linear infinite' }} /> checking…</span>
                : <span>{lastRefresh ? `updated ${timeAgo(lastRefresh)}` : 'not checked yet'}</span>
              }
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="primary" onClick={onNew}><I.Plus size={13} /> New connection</Button>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', overflow: 'hidden', marginBottom: 32 }}>
          {stat('Hosts', connections.length, `${groups.length} group${groups.length !== 1 ? 's' : ''}`)}
          {stat('Reachable', online, `${warn} slow · ${offline} off`)}
          {stat('Avg latency', avgLatency > 0 ? avgLatency : '—', avgLatency > 0 ? 'ms p50' : '')}
          {stat('Forwards', totalFwd, 'active')}
          <div style={{ flex: 1, padding: '16px 18px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 8 }}>Last checked</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
              {refreshing
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><I.Refresh size={12} style={{ animation: 'spin 1s linear infinite' }} /> checking…</span>
                : lastRefresh ? timeAgo(lastRefresh) : '—'
              }
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>auto every 30s</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, minWidth: 0 }}>
          {/* All hosts */}
          <section style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>All hosts</h2>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>Click a host to open a session</span>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '20px 1.4fr 1.6fr 0.7fr 0.7fr 0.6fr 28px', gap: 12, padding: '8px 16px', fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>
                <span/><span>Name</span><span>Address</span><span>Group</span><span>Latency</span><span>Last seen</span><span/>
              </div>
              {connections.slice(0, 12).map((h, i) => (
                <button key={h.id} onClick={() => onSelect(h.id)} style={{
                  display: 'grid', gridTemplateColumns: '20px 1.4fr 1.6fr 0.7fr 0.7fr 0.6fr 28px',
                  gap: 12, alignItems: 'center', padding: '10px 16px', width: '100%',
                  border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer',
                }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {h.name}
                    {h.pinned && <span style={{ color: 'var(--text-4)' }}><I.Pin size={10} /></span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-3)' }}>
                    {h.user}@{h.host}{h.port !== 22 ? `:${h.port}` : ''}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{h.group}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-2)' }}>
                    {h.latency != null ? `${h.latency}ms` : '—'}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{h.lastSeen}</span>
                  <span style={{ color: 'var(--text-4)', display: 'inline-flex', justifyContent: 'flex-end' }}><I.ArrowRight size={12} /></span>
                </button>
              ))}
              {connections.length === 0 && (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                  No connections yet. <button onClick={onNew} style={{ color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Add one</button>
                </div>
              )}
            </div>
          </section>

          {/* Right col */}
          <section style={{ minWidth: 0, overflow: 'hidden' }}>
            {/* Pinned */}
            {pinned.length > 0 && (
              <>
                <h2 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>Pinned</h2>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', overflow: 'hidden', marginBottom: 24 }}>
                  {pinned.map((h, i) => (
                    <button key={h.id} onClick={() => onSelect(h.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%',
                      border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      background: 'transparent', color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer',
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{h.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{h.host}</div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                        {h.latency != null ? `${h.latency}ms` : '—'}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Snippets */}
            <h2 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 500 }}>Snippets</h2>
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', overflow: 'hidden' }}>
              {snippets.slice(0, 5).map((s, i) => (
                <div key={s.name} style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                  {/* Row 1: name + tag */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                    <Tag>{s.tag}</Tag>
                  </div>
                  {/* Row 2: command + copy button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      $ {s.cmd}
                    </div>
                    <button
                      onClick={() => copySnippet(s.cmd, s.name)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', border: '1px solid var(--border)', borderRadius: 4, background: copiedSnippet === s.name ? 'var(--bg-active)' : 'transparent', color: copiedSnippet === s.name ? 'var(--text-1)' : 'var(--text-4)', cursor: 'pointer', fontSize: 10.5, fontFamily: 'var(--font-mono)', flexShrink: 0 }}
                      onMouseEnter={e => { if (copiedSnippet !== s.name) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
                      onMouseLeave={e => { if (copiedSnippet !== s.name) (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}>
                      {copiedSnippet === s.name ? <><I.Check size={10} /> copied</> : <><I.Copy size={10} /> copy</>}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
