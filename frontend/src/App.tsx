import { useState, useEffect, useMemo, Component, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { hasMod } from './lib/platform'
import { Sidebar } from './components/Sidebar'
import { TopBar, StatusBar } from './components/TopBar'
import { TerminalView } from './components/TerminalView'
import { LocalTerminalPane } from './components/LocalTerminalPane'
import { SftpView } from './components/SftpView'
import { KeysView } from './components/KeysView'
import { SettingsView } from './components/SettingsView'
import { Palette } from './components/Palette'
import { ConnectFlow } from './components/ConnectFlow'
import { HomeScreen } from './components/HomeScreen'
import { TweaksPanel, TweakSection, TweakSlider, TweakToggle, TweakRadio, useTweaks, TWEAK_DEFAULTS } from './ui/TweaksPanel'
import { I } from './ui/icons'
import { useConnections } from './store/connections'
import './index.css'

export default function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const { connections, load: loadConnections, setActiveSessionCount, activeSessionCount } = useConnections()
  const [route, setRoute] = useState('home')
  const [openHostIds, setOpenHostIds] = useState<string[]>([])
  const [activeHostId, setActiveHostId] = useState<string | null>(null)
  // Local terminals are app-level, not nested inside host TerminalView
  const [localTermIds, setLocalTermIds] = useState<string[]>([])
  const [activeLocalId, setActiveLocalId] = useState<string | null>(null)
  // Which "pane" is active: 'host' or 'local'
  const [activePane, setActivePane] = useState<'host' | 'local'>('host')
  const [connectedHostId, setConnectedHostId] = useState<string | null>(null)
  const [sftpVisible, setSftpVisible] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)
  const [connectDefaultGroup, setConnectDefaultGroup] = useState<string | undefined>()
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const addLocalTerminal = () => {
    const id = crypto.randomUUID()
    setLocalTermIds(prev => [...prev, id])
    setActiveLocalId(id)
    setActivePane('local')
    setRoute('host')
  }

  const closeLocalTerminal = (id: string) => {
    setLocalTermIds(prev => {
      const next = prev.filter(x => x !== id)
      if (activeLocalId === id) {
        if (next.length > 0) { setActiveLocalId(next[next.length - 1]) }
        else { setActiveLocalId(null); setActivePane('host') }
      }
      return next
    })
  }
  const [keysOpen, setKeysOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { document.body.dataset.theme = theme }, [theme])

  // Apply all CSS layout vars — single source of truth
  const applyLayout = (overrides?: Partial<typeof tw>) => {
    const v = { ...tw, ...overrides }
    const r = document.documentElement.style
    r.setProperty('--tw-sidebar-w', Math.max(200, Math.min(400, v.sidebarWidth)) + 'px')
    r.setProperty('--tw-search-h', v.searchHeight + 'px')
    r.setProperty('--tw-palette-h', v.paletteHeight + 'px')
    r.setProperty('--tw-term-fs', Math.max(10, Math.min(24, v.termFontSize)) + 'px')
    const dens = v.density === 'compact' ? 0.85 : v.density === 'comfortable' ? 1.15 : 1
    r.setProperty('--tw-density', String(dens))
  }

  useEffect(() => { applyLayout() }, [tw]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load real connections on startup + ping all
  useEffect(() => {
    loadConnections()
    invoke<{
      theme: string; terminal_font_size: number; ui_density: string
      sidebar_width: number
    }>('get_settings').then(s => {
      if (s.theme === 'light' || s.theme === 'dark') setTheme(s.theme)
      // Apply saved settings as overrides on top of TweaksPanel defaults
      applyLayout({
        sidebarWidth: s.sidebar_width || 264,
        termFontSize: s.terminal_font_size || 13,
        density: (s.ui_density as typeof tw.density) || 'default',
      })
    }).catch(console.error)
  }, [loadConnections])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = hasMod(e)
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(true) }
      else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); setConnectOpen(true) }
      else if (mod && e.key === '/') { e.preventDefault(); setTheme(t => t === 'dark' ? 'light' : 'dark') }
      else if (e.key === 'Escape') { setPaletteOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activeHost = connections.find(h => h.id === activeHostId) ?? null

  const onSelectHost = (id: string) => {
    setOpenHostIds(prev => prev.includes(id) ? prev : [...prev, id])
    setActiveHostId(id)
    setActivePane('host')
    setRoute('host')
  }

  const closeHostSession = (id: string) => {
    setOpenHostIds(prev => {
      const next = prev.filter(h => h !== id)
      if (activeHostId === id) {
        if (next.length > 0) { setActiveHostId(next[next.length - 1]); setActivePane('host') }
        else if (localTermIds.length > 0) { setActivePane('local') }
        else { setActiveHostId(null); setRoute('home') }
      }
      return next
    })
    if (connectedHostId === id) setConnectedHostId(null)
  }

  const breadcrumbs = useMemo(() => {
    if (route === 'dashboard') return [{ icon: <I.Dashboard />, label: 'Dashboard' }]
    if (route === 'keys') return [{ icon: <I.Key />, label: 'Keys & credentials' }]
    if (route === 'settings') return [{ icon: <I.Settings />, label: 'Settings' }]
    if (route === 'host' && activeHost) return [
      { icon: <I.Server />, label: 'Hosts' },
      { icon: <I.Folder />, label: activeHost.group },
      { icon: null, label: activeHost.name },
    ]
    return []
  }, [route, activeHost])

  const rightActions = route === 'host' && activeHost ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
      <I.Activity size={11} /> {activeHost.latency}ms
    </span>
  ) : undefined

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopBar
        theme={theme}
        onTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        onPalette={() => setPaletteOpen(true)}
        breadcrumbs={breadcrumbs}
        rightActions={rightActions} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          activeHostId={activeHostId}
          connectedHostId={connectedHostId}
          onSelect={onSelectHost}
          onNew={(group) => { setConnectDefaultGroup(group); setConnectOpen(true) }}
          route={route}
          onRoute={r => {
            if (r === 'keys') { setKeysOpen(true); return }
            if (r === 'settings') { setSettingsOpen(true); return }
            setRoute(r)
          }}
          collapsedGroups={collapsedGroups}
          setCollapsedGroups={setCollapsedGroups} />

        <main style={{ flex: 1, display: 'flex', minWidth: 0, position: 'relative' }}>
          {/* Home screen (MobaXterm-style) — shown on startup and when all sessions close */}
          <div style={{ display: (route === 'home' || route === 'dashboard') ? 'flex' : 'none', flex: 1, minWidth: 0 }}>
            <HomeScreen
              onSelect={onSelectHost}
              onNew={() => setConnectOpen(true)}
              connectedHostId={connectedHostId}
              onLocalTerminal={() => {
                // Open a floating local terminal — navigate to host view with a local tab trigger
                setRoute('local')
              }}
            />
          </div>

          {/* Standalone local terminal */}
          {route === 'local' && (
            <LocalTerminalScreen onHome={() => setRoute('home')} theme={theme} />
          )}

          {/* Terminal area: host sessions + local terminals, unified tab bar */}
          {route === 'host' && (
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', minWidth: 0 }}>
              {/* Tab bar — ALL open sessions (hosts + local terminals) */}
              <div style={{ display: 'flex', height: 34, borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flex: '0 0 34px', overflow: 'hidden' }}>
                {/* Host tabs */}
                {openHostIds.map(hid => {
                  const h = connections.find(c => c.id === hid)
                  if (!h) return null
                  const isActive = activePane === 'host' && hid === activeHostId
                  return (
                    <div key={hid} onClick={() => { setActiveHostId(hid); setActivePane('host') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px 0 12px', minWidth: 0, maxWidth: 220, cursor: 'pointer', borderRight: '1px solid var(--border)', background: isActive ? 'var(--bg-2)' : 'transparent', position: 'relative', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--text-1)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{h.user}@{h.name}</span>
                      <button onClick={e => { e.stopPropagation(); closeHostSession(hid) }} style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}>×</button>
                      {isActive && <span style={{ position: 'absolute', inset: 'auto 0 -1px 0', height: 1, background: 'var(--text-1)' }} />}
                    </div>
                  )
                })}
                {/* Local terminal tabs */}
                {localTermIds.map(lid => {
                  const isActive = activePane === 'local' && lid === activeLocalId
                  return (
                    <div key={lid} onClick={() => { setActiveLocalId(lid); setActivePane('local') }}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 10px 0 12px', minWidth: 0, maxWidth: 180, cursor: 'pointer', borderRight: '1px solid var(--border)', background: isActive ? 'var(--bg-2)' : 'transparent', position: 'relative', flexShrink: 0 }}>
                      <span style={{ fontSize: 10, opacity: 0.6 }}>⊞</span>
                      <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: isActive ? 'var(--text-1)' : 'var(--text-3)', flex: 1 }}>local</span>
                      <button onClick={e => { e.stopPropagation(); closeLocalTerminal(lid) }} style={{ width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-4)', cursor: 'pointer', borderRadius: 3, fontSize: 13 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)' }}>×</button>
                      {isActive && <span style={{ position: 'absolute', inset: 'auto 0 -1px 0', height: 1, background: 'var(--text-1)' }} />}
                    </div>
                  )
                })}
                {/* + new local terminal */}
                <button onClick={addLocalTerminal} title="New local terminal"
                  style={{ width: 32, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>+</button>
              </div>

              {/* Content area — host terminals + local terminals */}
              <div style={{ flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }}>
                {/* Host TerminalViews */}
                {openHostIds.map(hid => {
                  const h = connections.find(c => c.id === hid)
                  if (!h) return null
                  const isActive = activePane === 'host' && hid === activeHostId
                  return (
                    <div key={hid} style={{ position: 'absolute', inset: 0, display: 'flex', visibility: isActive ? 'visible' : 'hidden', pointerEvents: isActive ? 'auto' : 'none', zIndex: isActive ? 1 : 0 }}>
                      <TerminalView host={h}
                        sftpVisible={isActive && sftpVisible} onToggleSftp={() => setSftpVisible(v => !v)} theme={theme}
                        onSessionCountChange={n => {
                          if (hid === activeHostId) setActiveSessionCount(n)
                          if (n === 0) { closeHostSession(hid); setConnectedHostId(null) }
                          else setConnectedHostId(hid)
                        }} />
                      {isActive && sftpVisible && (
                        <SftpErrorBoundary onClose={() => setSftpVisible(false)}>
                          <SftpView host={h} onClose={() => setSftpVisible(false)} />
                        </SftpErrorBoundary>
                      )}
                    </div>
                  )
                })}
                {/* Local terminal panes */}
                {localTermIds.map(lid => {
                  const isActive = activePane === 'local' && lid === activeLocalId
                  return (
                    <div key={lid} style={{ position: 'absolute', inset: 0, visibility: isActive ? 'visible' : 'hidden', pointerEvents: isActive ? 'auto' : 'none', zIndex: isActive ? 1 : 0 }}>
                      <LocalTerminalPane sessionId={lid} active={isActive} theme={theme} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {tw.showStatusBar && <StatusBar activeHost={activeHost} sessions={activeSessionCount} theme={theme} />}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Layout" />
        <TweakRadio label="Density" value={tw.density} options={['compact', 'default', 'comfortable']} onChange={v => setTweak('density', v as typeof tw.density)} />
        <TweakSlider label="Sidebar width" value={tw.sidebarWidth} min={220} max={340} step={4} unit="px" onChange={v => setTweak('sidebarWidth', v)} />
        <TweakToggle label="Status bar" value={tw.showStatusBar} onChange={v => setTweak('showStatusBar', v)} />
        <TweakSection label="Search & inputs" />
        <TweakSlider label="Sidebar search height" value={tw.searchHeight} min={28} max={48} unit="px" onChange={v => setTweak('searchHeight', v)} />
        <TweakSlider label="Command palette height" value={tw.paletteHeight} min={44} max={80} unit="px" onChange={v => setTweak('paletteHeight', v)} />
        <TweakSection label="Terminal" />
        <TweakSlider label="Font size" value={tw.termFontSize} min={10} max={18} unit="px" onChange={v => setTweak('termFontSize', v)} />
        <TweakSection label="Theme" />
        <TweakRadio label="Mode" value={theme} options={['light', 'dark']} onChange={v => setTheme(v as 'light' | 'dark')} />
      </TweaksPanel>

      {paletteOpen && (
        <Palette
          onClose={() => setPaletteOpen(false)}
          onNavigate={r => { if (r === 'new') setConnectOpen(true); else setRoute(r); setPaletteOpen(false) }}
          onConnect={id => { onSelectHost(id); setPaletteOpen(false) }}
          onTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
      )}

      {connectOpen && (
        <ConnectFlow
          defaultGroup={connectDefaultGroup}
          onClose={() => { setConnectOpen(false); setConnectDefaultGroup(undefined) }}
          onConnected={() => {
            setConnectOpen(false)
            const newHost = connections.find(h => h.status === 'online')
            if (newHost) { setActiveHostId(newHost.id); setRoute('host') }
          }} />
      )}

      {/* Keys modal */}
      {keysOpen && (
        <PanelModal title="Keys & credentials" onClose={() => setKeysOpen(false)}>
          <KeysView />
        </PanelModal>
      )}

      {/* Settings modal */}
      {settingsOpen && (
        <PanelModal title="Settings" onClose={() => setSettingsOpen(false)}>
          <SettingsView theme={theme} onTheme={t => setTheme(t as 'dark' | 'light')} />
        </PanelModal>
      )}
    </div>
  )
}

function PanelModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(920px, 92vw)', height: 'min(680px, 88vh)',
        background: 'var(--bg-2)', border: '1px solid var(--border)',
        borderRadius: 12, boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 18px', height: 44, borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flex: '0 0 44px' }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{ width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 6, fontSize: 16 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            ×
          </button>
        </div>
        {/* Modal content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function LocalTerminalScreen({ onHome, theme }: { onHome: () => void; theme: string }) {
  const sessionId = useState(() => crypto.randomUUID())[0]
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ height: 34, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', gap: 8 }}>
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>local terminal</span>
        <span style={{ flex: 1 }} />
        <button onClick={onHome} style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>← Home</button>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <LocalTerminalPane sessionId={sessionId} active theme={theme} />
      </div>
    </div>
  )
}

class SftpErrorBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: string | null }> {
  state = { error: null }
  static getDerivedStateFromError(e: unknown) {
    return { error: String(e) }
  }
  componentDidCatch(e: unknown, info: unknown) {
    console.error('SftpView crashed:', e, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex: '0 0 380px', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-1)', padding: 24, gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>SFTP Error</div>
          <div style={{ fontSize: 11.5, color: '#ff7b72', fontFamily: 'var(--font-mono)', textAlign: 'center', lineHeight: 1.6, maxWidth: 300 }}>{this.state.error}</div>
          <button onClick={() => { this.setState({ error: null }); this.props.onClose() }} style={{ marginTop: 8, padding: '6px 16px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12 }}>Close</button>
        </div>
      )
    }
    return this.props.children
  }
}
