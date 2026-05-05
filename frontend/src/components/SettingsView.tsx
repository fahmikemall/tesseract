import { useState, useEffect, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Input, Select, Toggle, Kbd } from '../ui/primitives'
import { modKey } from '../lib/platform'

interface AppSettings {
  theme: string
  terminal_font: string
  terminal_font_size: number
  terminal_scrollback: number
  terminal_cursor: string
  terminal_bell: boolean
  ssh_default_port: number
  ssh_timeout: number
  ssh_keepalive: number
  ssh_strict_host_key: boolean
  ssh_known_hosts: string
  ui_density: string
  sidebar_width: number
  show_status_bar: boolean
  launch_on_startup: boolean
  auto_update: boolean
  telemetry: boolean
}

const DEFAULT: AppSettings = {
  theme: 'dark', terminal_font: 'JetBrains Mono', terminal_font_size: 13,
  terminal_scrollback: 10000, terminal_cursor: 'bar', terminal_bell: false,
  ssh_default_port: 22, ssh_timeout: 20, ssh_keepalive: 60,
  ssh_strict_host_key: true, ssh_known_hosts: '~/.ssh/known_hosts',
  ui_density: 'default', sidebar_width: 264, show_status_bar: true,
  launch_on_startup: false, auto_update: true, telemetry: false,
}

const sections = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'ssh', label: 'SSH' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'advanced', label: 'Advanced' },
]

const ShortcutGroup = ({ label, shortcuts }: { label: string; shortcuts: [string, string[]][] }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-4)', textTransform: 'uppercase', padding: '16px 0 8px', borderBottom: '1px solid var(--border)' }}>
      {label}
    </div>
    {shortcuts.map(([action, keys]) => (
      <div key={action} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12.5, fontWeight: 450, color: 'var(--text-1)', alignSelf: 'center' }}>{action}</div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          {keys.length === 1 && keys[0].length > 6
            ? <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{keys[0]}</span>
            : keys.map((k, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {i > 0 && <span style={{ color: 'var(--text-4)', fontSize: 11 }}>+</span>}
                  <Kbd>{k}</Kbd>
                </span>
              ))
          }
        </div>
      </div>
    ))}
  </div>
)

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
      {hint && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
    </div>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>{children}</div>
  </div>
)

export const SettingsView = ({ theme, onTheme }: { theme: string; onTheme: (t: string) => void }) => {
  const [section, setSection] = useState('general')
  const [s, setS] = useState<AppSettings>(DEFAULT)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    invoke<AppSettings>('get_settings').then(setS).catch(console.error)
  }, [])

  const update = <K extends keyof AppSettings>(key: K, val: AppSettings[K]) => {
    const next = { ...s, [key]: val }
    setS(next)
    invoke('save_settings', { settings: next }).then(() => {
      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
    }).catch(console.error)

    // Apply changes immediately to CSS vars / app state
    const r = document.documentElement.style
    if (key === 'theme') onTheme(val as string)
    if (key === 'sidebar_width') r.setProperty('--tw-sidebar-w', Math.max(200, Math.min(400, val as number)) + 'px')
    if (key === 'terminal_font_size') r.setProperty('--tw-term-fs', Math.max(10, Math.min(24, val as number)) + 'px')
    if (key === 'ui_density') {
      const dens = val === 'compact' ? 0.85 : val === 'comfortable' ? 1.15 : 1
      r.setProperty('--tw-density', String(dens))
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-2)' }}>
      {/* Section nav */}
      <aside style={{ width: 200, flex: '0 0 200px', borderRight: '1px solid var(--border)', padding: '20px 12px', background: 'var(--bg-1)' }}>
        <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-4)', textTransform: 'uppercase', padding: '0 8px 8px' }}>Settings</div>
        {sections.map(sec => (
          <button key={sec.id} onClick={() => setSection(sec.id)} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '6px 10px', height: 28, border: 'none',
            background: section === sec.id ? 'var(--bg-active)' : 'transparent',
            color: section === sec.id ? 'var(--text-1)' : 'var(--text-2)',
            borderRadius: 6, cursor: 'pointer', fontSize: 12.5,
            fontWeight: section === sec.id ? 500 : 450, marginBottom: 1,
          }}
            onMouseEnter={e => { if (section !== sec.id) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { if (section !== sec.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
            {sec.label}
          </button>
        ))}
        {saved && (
          <div style={{ marginTop: 16, padding: '6px 10px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', background: 'var(--bg-2)', borderRadius: 6, textAlign: 'center' }}>
            ✓ Saved
          </div>
        )}
      </aside>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ maxWidth: 720, padding: '28px 36px 60px' }}>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 500 }}>{sections.find(x => x.id === section)?.label}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4, marginBottom: 8 }}>
            Settings are saved automatically.
          </div>

          {section === 'general' && <>
            <Row label="Launch on startup" hint="Open Tesseract automatically when your computer boots.">
              <Toggle checked={s.launch_on_startup} onChange={v => update('launch_on_startup', v)} />
            </Row>
            <Row label="Auto-update" hint="Currently on v1.0.4. Last checked 2 hours ago.">
              <Toggle checked={s.auto_update} onChange={v => update('auto_update', v)} />
            </Row>
            <Row label="Telemetry" hint="Send anonymous usage data to help improve the product.">
              <Toggle checked={s.telemetry} onChange={v => update('telemetry', v)} />
            </Row>
          </>}

          {section === 'appearance' && <>
            <Row label="Theme" hint="Choose between light and dark modes.">
              <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, padding: 2, background: 'var(--bg-2)' }}>
                {[['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => (
                  <button key={k} onClick={() => update('theme', k)} style={{
                    padding: '5px 14px', height: 26, border: 'none', borderRadius: 4,
                    background: theme === k ? 'var(--bg-0)' : 'transparent',
                    color: theme === k ? 'var(--text-1)' : 'var(--text-3)',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    boxShadow: theme === k ? 'var(--shadow-sm)' : 'none',
                  }}>{l}</button>
                ))}
              </div>
            </Row>
            <Row label="UI density" hint="Compact reduces row heights and paddings.">
              <Select value={s.ui_density} onChange={e => update('ui_density', e.target.value)} style={{ maxWidth: 200 }}>
                <option value="compact">Compact</option>
                <option value="default">Default</option>
                <option value="comfortable">Comfortable</option>
              </Select>
            </Row>
            <Row label="Sidebar width">
              <Input type="number" value={s.sidebar_width} onChange={e => update('sidebar_width', parseInt(e.target.value) || 264)} style={{ maxWidth: 100 }} mono />
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>px</span>
            </Row>
            <Row label="Status bar" hint="Show session info at the bottom of the window.">
              <Toggle checked={s.show_status_bar} onChange={v => update('show_status_bar', v)} />
            </Row>
          </>}

          {section === 'terminal' && <>
            <Row label="Font family" hint="Used in all terminal panes.">
              <Select value={s.terminal_font} onChange={e => update('terminal_font', e.target.value)} style={{ maxWidth: 240 }}>
                <option>JetBrains Mono</option>
                <option>Fira Code</option>
                <option>Menlo</option>
                <option>Cascadia Code</option>
                <option>Consolas</option>
              </Select>
            </Row>
            <Row label="Font size">
              <Input type="number" value={s.terminal_font_size} min={8} max={24}
                onChange={e => update('terminal_font_size', parseInt(e.target.value) || 13)}
                style={{ maxWidth: 80 }} mono />
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>px</span>
            </Row>
            <Row label="Cursor style">
              <Select value={s.terminal_cursor} onChange={e => update('terminal_cursor', e.target.value)} style={{ maxWidth: 160 }}>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="bar">Bar</option>
              </Select>
            </Row>
            <Row label="Scrollback lines">
              <Input type="number" value={s.terminal_scrollback}
                onChange={e => update('terminal_scrollback', parseInt(e.target.value) || 10000)}
                style={{ maxWidth: 120 }} mono />
            </Row>
            <Row label="Bell" hint="Play sound or flash the tab on bell signal.">
              <Toggle checked={s.terminal_bell} onChange={v => update('terminal_bell', v)} />
            </Row>
          </>}

          {section === 'ssh' && <>
            <Row label="Default port">
              <Input type="number" value={s.ssh_default_port}
                onChange={e => update('ssh_default_port', parseInt(e.target.value) || 22)}
                style={{ maxWidth: 100 }} mono />
            </Row>
            <Row label="Connection timeout" hint="Seconds before giving up on a new connection.">
              <Input type="number" value={s.ssh_timeout}
                onChange={e => update('ssh_timeout', parseInt(e.target.value) || 20)}
                style={{ maxWidth: 100 }} mono />
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>seconds</span>
            </Row>
            <Row label="Keepalive interval" hint="Send a null packet every N seconds to keep idle sessions alive.">
              <Input type="number" value={s.ssh_keepalive}
                onChange={e => update('ssh_keepalive', parseInt(e.target.value) || 60)}
                style={{ maxWidth: 100 }} mono />
              <span style={{ fontSize: 12, color: 'var(--text-3)', alignSelf: 'center' }}>seconds</span>
            </Row>
            <Row label="Strict host key checking" hint="Refuse to connect when a host key changes.">
              <Toggle checked={s.ssh_strict_host_key} onChange={v => update('ssh_strict_host_key', v)} />
            </Row>
            <Row label="known_hosts file">
              <Input value={s.ssh_known_hosts}
                onChange={e => update('ssh_known_hosts', e.target.value)}
                style={{ maxWidth: 320 }} mono />
            </Row>
          </>}

          {section === 'shortcuts' && <>
            <ShortcutGroup label="Navigation" shortcuts={[
              ['Open command palette', [`${modKey}`, 'K']],
              ['New connection', [`${modKey}`, 'N']],
              ['Go to home screen', [`${modKey}`, 'H']],
            ]} />
            <ShortcutGroup label="Terminal tabs" shortcuts={[
              ['New SSH tab', [`${modKey}`, 'T']],
              ['New local terminal', [`${modKey}`, 'Shift', 'T']],
              ['Close current tab', [`${modKey}`, 'W']],
              ['Next tab', ['Ctrl', 'Tab']],
              ['Previous tab', ['Ctrl', 'Shift', 'Tab']],
            ]} />
            <ShortcutGroup label="Terminal — copy & paste" shortcuts={[
              ['Copy selection', ['Ctrl', 'Shift', 'C']],
              ['Paste from clipboard', ['Ctrl', 'Shift', 'V']],
              ['Right-click', ['Context menu (Copy / Paste / Clear)']],
            ]} />
            <ShortcutGroup label="Terminal — search & scroll" shortcuts={[
              ['Scroll up', ['Shift', '↑ or PgUp']],
              ['Scroll down', ['Shift', '↓ or PgDn']],
              ['Scroll to top', ['Shift', 'Home']],
              ['Scroll to bottom', ['Shift', 'End']],
            ]} />
            <ShortcutGroup label="App" shortcuts={[
              ['Toggle SFTP panel', [`${modKey}`, 'B']],
              ['Toggle theme', [`${modKey}`, '/']],
              ['Open Keys', [`${modKey}`, 'Shift', 'K']],
              ['Open Settings', [`${modKey}`, ',']],
            ]} />
          </>}

          {section === 'advanced' && <>
            <Row label="Settings file" hint="Auto-saved on every change.">
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                %APPDATA%\xyz.fahmikemal.tesseract\settings.json
              </span>
            </Row>
            <Row label="Database" hint="SSH connections are stored here.">
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                %APPDATA%\xyz.fahmikemal.tesseract\connections.db
              </span>
            </Row>
            <Row label="Reset to defaults" hint="Removes all preferences but keeps connections and keys.">
              <button onClick={() => {
                const reset = { ...DEFAULT, theme }
                setS(reset)
                invoke('save_settings', { settings: reset }).catch(console.error)
              }} style={{
                padding: '6px 14px', border: '1px solid var(--border-strong)', borderRadius: 6,
                background: 'transparent', color: 'var(--text-1)', cursor: 'pointer', fontSize: 12.5,
              }}>Reset preferences</button>
            </Row>
          </>}
        </div>
      </div>
    </div>
  )
}
