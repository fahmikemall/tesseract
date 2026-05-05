import { getCurrentWindow } from '@tauri-apps/api/window'
import { I } from '../ui/icons'
import { IconBtn, Kbd } from '../ui/primitives'
import { StatusDot } from '../ui/primitives'
import { MarkWireframe } from '../ui/Logo'
import { modKey } from '../lib/platform'
import type { ReactNode } from 'react'

const win = () => getCurrentWindow()

interface Breadcrumb { icon: ReactNode; label: string }

interface TopBarProps {
  theme: string
  onTheme: () => void
  onPalette: () => void
  breadcrumbs?: Breadcrumb[]
  rightActions?: ReactNode
}

export const TopBar = ({ theme, onTheme, onPalette, breadcrumbs = [], rightActions }: TopBarProps) => (
  <header style={{
    display: 'flex', alignItems: 'center', height: 40,
    borderBottom: '1px solid var(--border)', background: 'var(--bg-1)',
    flex: '0 0 40px', userSelect: 'none',
    // @ts-expect-error Tauri drag region
    WebkitAppRegion: 'drag',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px 0 12px',
      // @ts-expect-error Tauri drag region
      WebkitAppRegion: 'no-drag',
    }}>
      <MarkWireframe size={17} color="var(--text-1)" stroke={1.5} />
      <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>tesseract</span>
    </div>

    {breadcrumbs.length > 0 && (
      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 4px' }} />
    )}

    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5,
      color: 'var(--text-2)', flex: 1, minWidth: 0,
      // @ts-expect-error Tauri drag region
      WebkitAppRegion: 'no-drag',
    }}>
      {breadcrumbs.map((b, i) => (
        <span key={i} style={{ display: 'contents' }}>
          {i > 0 && <span style={{ color: 'var(--text-4)' }}>/</span>}
          <span style={{
            color: i === breadcrumbs.length - 1 ? 'var(--text-1)' : 'var(--text-3)',
            fontWeight: i === breadcrumbs.length - 1 ? 500 : 450,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>{b.icon}{b.label}</span>
        </span>
      ))}
    </div>

    {/* Right actions */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
      // @ts-expect-error Tauri drag region
      WebkitAppRegion: 'no-drag',
    }}>
      {rightActions}
      <button onClick={onPalette} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, height: 26, padding: '0 8px',
        background: 'var(--bg-2)', color: 'var(--text-3)',
        border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
        fontSize: 12, fontFamily: 'var(--font-ui)',
      }}>
        <I.Search size={12} /> <span>Quick command</span>
        <Kbd>{modKey}K</Kbd>
      </button>
      <IconBtn icon={theme === 'dark' ? <I.Sun /> : <I.Moon />} title="Toggle theme" onClick={onTheme} />
      {/* Custom window controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginLeft: 4 }}>
        <IconBtn icon={<svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1"/></svg>} title="Minimize" size={26} onClick={() => win().minimize()} />
        <IconBtn icon={<svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1"/></svg>} title="Maximize" size={26} onClick={() => win().toggleMaximize()} />
        <IconBtn icon={<I.X size={12} />} title="Close" size={26} onClick={() => win().close()} />
      </div>
    </div>
  </header>
)

interface StatusBarProps {
  activeHost?: { user: string; host: string; port: number; fwd: number; latency: number | null } | null
  sessions: number
  theme: string
}

export const StatusBar = ({ activeHost, sessions, theme }: StatusBarProps) => (
  <footer style={{
    display: 'flex', alignItems: 'center', height: 22,
    borderTop: '1px solid var(--border)', background: 'var(--bg-1)', color: 'var(--text-3)',
    fontSize: 11, fontFamily: 'var(--font-mono)', padding: '0 10px', gap: 14, flex: '0 0 22px',
  }}>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <StatusDot status="online" size={6} /> {sessions} active
    </span>
    {activeHost && (
      <>
        <span>{activeHost.user}@{activeHost.host}:{activeHost.port}</span>
        <span>↳ {activeHost.fwd} fwd</span>
        <span>{activeHost.latency}ms</span>
      </>
    )}
    <span style={{ flex: 1 }} />
    <span>UTF-8</span>
    <span>xterm-256color</span>
    <span>{theme}</span>
    <span>v1.0.4</span>
  </footer>
)
