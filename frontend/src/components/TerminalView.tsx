import { useState, useRef, useEffect, type ReactNode } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { invoke } from '@tauri-apps/api/core'
import { I } from '../ui/icons'
import { StatusDot, IconBtn, Tag } from '../ui/primitives'
import { useConnections } from '../store/connections'
import type { Host } from '../data'
import { RealTerminalPane } from './RealTerminalPane'
import { LocalTerminalPane } from './LocalTerminalPane'
import { EditConnectionModal } from './EditConnectionModal'
import { useServerStats } from '../hooks/useServerStats'

interface TermSettings {
  fontSize: number
  fontFamily: string
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  scrollback: number
  bell: boolean
}


interface TerminalViewProps {
  host: Host
  sftpVisible: boolean
  onToggleSftp: () => void
  onSessionCountChange?: (count: number) => void
  theme?: string
}

interface Tab {
  id: string
  sessionId: string
  title: string
  type: 'ssh' | 'local'
}

export const TerminalView = ({ host, sftpVisible, onToggleSftp, onSessionCountChange, theme }: TerminalViewProps) => {
  const makeSSHTab = (): Tab => {
    const sessionId = uuidv4()
    return { id: sessionId, sessionId, title: `${host.user}@${host.name}`, type: 'ssh' }
  }


  const [tabs, setTabs] = useState<Tab[]>(() => [makeSSHTab()])
  const [activeTab, setActiveTab] = useState<string>(() => tabs[0].id)
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null)
  const [splitMode, setSplitMode] = useState(false)
  const [confirmClose, setConfirmClose] = useState<{ id: string; title: string } | null>(null)
  // Track which sessions have received output (i.e., are "active" SSH sessions)
  const activeSessionsRef = useRef<Set<string>>(new Set())

  const markActive = (sessionId: string) => activeSessionsRef.current.add(sessionId)

  const sshCount = (tabList: Tab[]) => tabList.filter(t => t.type === 'ssh').length

  const doCloseTab = (id: string) => {
    const next = tabs.filter(t => t.id !== id)
    setTabs(next)
    if (activeTab === id) setActiveTab(next[next.length - 1]?.id ?? '')
    onSessionCountChange?.(sshCount(next))
    activeSessionsRef.current.delete(id)
  }

  const closeTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    const tab = tabs.find(t => t.id === id)
    // Only confirm for SSH tabs that have received output (real session in progress)
    if (tab?.type === 'ssh' && activeSessionsRef.current.has(id)) {
      setConfirmClose({ id, title: tab.title })
    } else {
      doCloseTab(id)
    }
  }


  const addSSHTab = () => {
    const tab = makeSSHTab()
    setTabs(prev => {
      const next = [...prev, tab]
      onSessionCountChange?.(sshCount(next))
      return next
    })
    setActiveTab(tab.id)
  }

  const toggleSplit = () => {
    if (splitMode) {
      setSplitMode(false)
      setSplitSessionId(null)
    } else {
      setSplitMode(true)
      setSplitSessionId(uuidv4())
    }
  }

  // Report SSH session count to parent on mount and whenever tabs change
  const [showEditForPassword, setShowEditForPassword] = useState(false)
  const [termSettings, setTermSettings] = useState<TermSettings>({
    fontSize: 13, fontFamily: 'JetBrains Mono', cursorStyle: 'bar',
    cursorBlink: true, scrollback: 10000, bell: false,
  })

  // Load settings from disk on mount
  useEffect(() => {
    invoke<Record<string, unknown>>('get_settings').then(s => {
      if (!s) return
      setTermSettings({
        fontSize: Number(s.terminal_font_size) || 13,
        fontFamily: String(s.terminal_font || 'JetBrains Mono'),
        cursorStyle: (s.terminal_cursor as 'bar' | 'block' | 'underline') || 'bar',
        cursorBlink: true,
        scrollback: Number(s.terminal_scrollback) || 10000,
        bell: Boolean(s.terminal_bell),
      })
    }).catch(console.error)
  }, [])

  useEffect(() => {
    onSessionCountChange?.(sshCount(tabs))
  }, [tabs.length])

  // These pure computations are needed as hook arguments — no hooks called here
  const activeTabObj = tabs.find(t => t.id === activeTab)
  const activeIsSSH = activeTabObj?.type === 'ssh'

  // Hooks that need the above values
  const { connections, snippets } = useConnections()
  const stats = useServerStats(host, activeIsSSH)

  // Pure computed values — no hooks below
  const recentHosts = connections.slice(0, 5)
  const frequentHosts = connections.filter(h => h.pinned || h.fwd > 0).slice(0, 4)

  const EmptyPane = () => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-2)', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '36px 44px' }}>
        <div style={{ maxWidth: 740, margin: '0 auto' }}>

          {/* Reconnect to current host */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Current host</div>
            <button onClick={addSSHTab} style={{
              display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 18px',
              background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer', transition: 'background 80ms',
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-1)'}>
              <StatusDot status={host.status} size={8} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{host.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {host.user}@{host.host}{host.port !== 22 ? `:${host.port}` : ''}
                </div>
              </div>
              {host.latency != null && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>{host.latency}ms</span>}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-2)' }}>
                <I.Plus size={12} /> New tab
              </div>
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>

            {/* Recent */}
            <section>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>Recent</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {recentHosts.map((h, i) => (
                  <button key={h.id} onClick={addSSHTab} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                    background: 'var(--bg-1)', border: '1px solid var(--border)',
                    borderRadius: i === 0 ? '8px 8px 0 0' : i === 4 ? '0 0 8px 8px' : '0',
                    marginTop: i === 0 ? 0 : -1, position: 'relative', zIndex: 0,
                    color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer', transition: 'background 80ms',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.zIndex = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-1)'; (e.currentTarget as HTMLElement).style.zIndex = '0' }}>
                    <StatusDot status={h.status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{h.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.user}@{h.host}
                      </div>
                    </div>
                    {h.latency != null
                      ? <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>{h.latency}ms</span>
                      : <span style={{ fontSize: 10.5, color: 'var(--text-4)' }}>—</span>
                    }
                  </button>
                ))}
              </div>
            </section>

            {/* Right col */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Frequent */}
              <section>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>Frequent</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  {frequentHosts.map(h => (
                    <button key={h.id} onClick={addSSHTab} style={{
                      display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px',
                      background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 7,
                      color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer', transition: 'background 80ms',
                    }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-1)'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <StatusDot status={h.status} />
                        <span style={{ fontSize: 11.5, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h.host}
                      </div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {h.tags.slice(0, 2).map(t => <Tag key={t}>{t}</Tag>)}
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Snippets */}
              <section>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>Snippets</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {snippets.slice(0, 3).map((s, i) => (
                    <div key={s.name} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                      background: 'var(--bg-1)', border: '1px solid var(--border)',
                      borderRadius: i === 0 ? '7px 7px 0 0' : i === 2 ? '0 0 7px 7px' : '0',
                      marginTop: i === 0 ? 0 : -1,
                    }}>
                      <I.Bolt size={11} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 500 }}>{s.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>$ {s.cmd}</div>
                      </div>
                      <Tag>{s.tag}</Tag>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // Renders ALL panes (hidden when not active) — keeps sessions alive
  const renderPanes = () => (
    <>
      {tabs.map(t => t.type === 'local'
        ? <LocalTerminalPane
            key={t.sessionId}
            sessionId={t.sessionId}
            theme={theme}
            active={t.id === activeTab && !splitMode}
          />
        : <RealTerminalPane
            key={t.sessionId}
            sessionId={t.sessionId}
            host={host}
            theme={theme}
            termSettings={termSettings}
            active={t.id === activeTab && !splitMode}
            onClose={() => closeTab(t.id)}
            onConnected={() => markActive(t.id)}
          />
      )}
      {splitMode && splitSessionId && (
        <RealTerminalPane
          key={'split-' + splitSessionId}
          sessionId={splitSessionId}
          host={host}
          theme={theme}
          active={splitMode}
          onClose={() => toggleSplit()}
        />
      )}
    </>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg-2)' }}>
      {/* Toolbar — only shows when there are extra SSH sessions to the same host */}
      <div style={{ display: 'flex', alignItems: 'stretch', height: 34, borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flex: '0 0 34px' }}>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Extra SSH sessions to same host (rare) */}
          {tabs.filter(t => t.type === 'ssh').length > 1 && tabs.filter(t => t.type === 'ssh').map(t => {
            const active = t.id === activeTab
            return (
              <div key={t.id} onClick={() => setActiveTab(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 12px',
                borderRight: '1px solid var(--border)',
                background: active ? 'var(--bg-2)' : 'transparent',
                color: active ? 'var(--text-1)' : 'var(--text-3)',
                cursor: 'pointer', fontSize: 12, position: 'relative', minWidth: 0, maxWidth: 180,
              }}>
                <span style={{ fontSize: 11, color: 'var(--text-4)' }}>#{tabs.filter(x => x.type === 'ssh').indexOf(t) + 1}</span>
                <button onClick={e => { e.stopPropagation(); closeTab(t.id) }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14, border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', borderRadius: 3 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}>×</button>
                {active && <span style={{ position: 'absolute', inset: 'auto 0 -1px 0', height: 1, background: 'var(--text-1)' }} />}
              </div>
            )
          })}
          <button onClick={addSSHTab} title="New SSH session to this host" style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 28, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            <I.Plus size={12} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '0 6px', borderLeft: '1px solid var(--border)' }}>
          <button onClick={() => setTermSettings(s => ({ ...s, fontSize: Math.max(8, s.fontSize - 1) }))} title="Decrease font size"
            style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 4, fontSize: 14, fontWeight: 600 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>−</button>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', minWidth: 18, textAlign: 'center' }}>{termSettings.fontSize}</span>
          <button onClick={() => setTermSettings(s => ({ ...s, fontSize: Math.min(28, s.fontSize + 1) }))} title="Increase font size"
            style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 4, fontSize: 14, fontWeight: 600 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>+</button>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />
          <IconBtn icon={<I.Split />} title="Split pane" active={splitMode} onClick={toggleSplit} />
          <IconBtn icon={<I.Folder />} title="SFTP" active={sftpVisible} onClick={onToggleSftp} />
          <IconBtn icon={<I.More />} title="Session menu" />
        </div>
      </div>

      {/* Panes */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, background: '#0d1117' }}>
        {tabs.length === 0
          ? <EmptyPane />
          : <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>{renderPanes()}</div>
        }
      </div>

      {/* Session ribbon / stats bar */}
      <div style={{ flex: '0 0 26px', height: 26, display: 'flex', alignItems: 'center', gap: 0, padding: '0 6px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', borderTop: '1px solid var(--border)', background: 'var(--bg-1)', overflow: 'hidden' }}>
        {/* Connection info */}
        <StatChip icon={<I.Lock size={10} />} value={`${host.user}@${host.host}:${host.port}`} />
        {host.latency != null && <StatChip value={`${host.latency}ms`} />}

        {/* Stats hint for password auth */}
        {activeIsSSH && host.auth_type === 'password' && (
          <StatChip value="monitoring tersedia untuk key auth" title="Tambahkan SSH key untuk melihat CPU/memory stats" />
        )}

        {/* Server stats — live data via SSH exec, updates every 15s */}
        {activeIsSSH && stats.available && <>
          {stats.cpu !== null && <StatChip label="cpu" value={`${stats.cpu}%`} title="CPU usage" />}
          {stats.memUsedGb !== null && stats.memTotalGb !== null && (
            <StatChip label="mem" value={`${stats.memUsedGb.toFixed(1)}/${stats.memTotalGb.toFixed(1)}GB`} title="Memory used / total" />
          )}
          {stats.netRxKbps !== null && stats.netTxKbps !== null && (
            <StatChip label="net" value={`↑${fmtNet(stats.netTxKbps)} ↓${fmtNet(stats.netRxKbps)}`} title="Network TX / RX" />
          )}
          {stats.uptime !== null && <StatChip label="up" value={stats.uptime} title="Uptime" />}
          {stats.users !== null && <StatChip label="users" value={`${stats.users}`} title="Logged in users" />}
          {stats.diskPct !== null && <StatChip label="disk" value={`${stats.diskPct}%`} title="Root disk / usage" />}
        </>}

        <span style={{ flex: 1 }} />
        {activeTabObj?.type === 'local' && <span style={{ color: 'var(--text-4)' }}>local shell</span>}
      </div>

      {/* Edit modal — switch to password auth */}
      {showEditForPassword && (
        <EditConnectionModal host={{ ...host, auth_type: 'password' }} onClose={() => setShowEditForPassword(false)} />
      )}

      {/* Close confirmation modal */}
      {confirmClose && (
        <CloseConfirmModal
          title={confirmClose.title}
          onConfirm={() => { doCloseTab(confirmClose.id); setConfirmClose(null) }}
          onCancel={() => setConfirmClose(null)}
        />
      )}
    </div>
  )
}

function CloseConfirmModal({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Close session?</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>{title}</div>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 16 }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>⚠️</span>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Menutup tab ini akan memutus koneksi SSH.<br />
              Proses yang sedang berjalan di server mungkin akan terhenti.
            </p>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={{ padding: '6px 14px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer' }}>
              Batal
            </button>
            <button onClick={onConfirm} style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: '#cf222e', color: '#fff', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}>
              Putuskan koneksi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatChip({ icon, label, value, title }: { icon?: ReactNode; label?: string; value: string; title?: string }) {
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '0 8px', height: 26, borderRight: '1px solid var(--border)',
      whiteSpace: 'nowrap', fontSize: 11, fontFamily: 'var(--font-mono)',
      color: 'var(--text-3)',
    }}>
      {icon && <span style={{ opacity: 0.7, fontSize: 10 }}>{icon}</span>}
      {label && <span style={{ color: 'var(--text-4)', fontSize: 10 }}>{label}</span>}
      <span style={{ color: 'var(--text-2)' }}>{value}</span>
    </span>
  )
}

function fmtNet(kbps: number): string {
  if (kbps >= 1024) return `${(kbps / 1024).toFixed(1)} MB/s`
  return `${kbps} KB/s`
}
