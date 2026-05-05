import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { readText } from '@tauri-apps/plugin-clipboard-manager'
import { useConnections } from '../store/connections'
import type { Host } from '../data'
import '@xterm/xterm/css/xterm.css'

interface TermSettings {
  fontSize: number
  fontFamily: string
  cursorStyle: 'bar' | 'block' | 'underline'
  cursorBlink: boolean
  scrollback: number
  bell: boolean
}

interface Props {
  sessionId: string
  host: Host
  active: boolean
  theme?: string
  termSettings?: TermSettings
  onClose: () => void
  onConnected?: () => void
}

const DARK_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#c9d1d9',
  cursorAccent: '#0d1117',
  selectionBackground: '#388bfd33',
  black: '#0d1117', red: '#ff7b72', green: '#3fb950',
  yellow: '#d29922', blue: '#58a6ff', magenta: '#bc8cff',
  cyan: '#76e3ea', white: '#c9d1d9',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
  brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
  brightCyan: '#b3f0ff', brightWhite: '#ffffff',
}

const LIGHT_THEME = {
  background: '#f8f9fa',
  foreground: '#1c1e21',
  cursor: '#1c1e21',
  cursorAccent: '#f8f9fa',
  selectionBackground: '#0969da33',
  black: '#1c1e21', red: '#cf222e', green: '#116329',
  yellow: '#4d2d00', blue: '#0550ae', magenta: '#8250df',
  cyan: '#1b7c83', white: '#6e7781',
  brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37',
  brightYellow: '#633c01', brightBlue: '#0969da', brightMagenta: '#6639ba',
  brightCyan: '#1b7c83', brightWhite: '#24292f',
}

interface CtxMenu { x: number; y: number; hasSelection: boolean; selection: string }

const DEFAULT_SETTINGS: TermSettings = { fontSize: 13, fontFamily: 'JetBrains Mono', cursorStyle: 'bar', cursorBlink: true, scrollback: 10000, bell: false }

export function RealTerminalPane({ sessionId, host, active, theme, termSettings = DEFAULT_SETTINGS, onClose, onConnected }: Props) {
  const { fontSize, fontFamily, cursorStyle, cursorBlink, scrollback } = termSettings
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const readyRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onConnectedRef = useRef(onConnected)
  onConnectedRef.current = onConnected
  const hostRef = useRef(host)
  hostRef.current = host
  const [, forceUpdate] = useState(0)
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  // Re-apply theme when it changes
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const isDark = (theme ?? document.body.dataset.theme) === 'dark'
    term.options.theme = isDark ? DARK_THEME : LIGHT_THEME
    if (containerRef.current) {
      containerRef.current.style.background = isDark ? DARK_THEME.background : LIGHT_THEME.background
    }
    forceUpdate(n => n + 1)
  }, [theme])

  useEffect(() => {
    if (!containerRef.current) return

    const isDark = (theme ?? document.body.dataset.theme) === 'dark'

    const term = new Terminal({
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      fontFamily: `'${fontFamily}', 'JetBrains Mono', ui-monospace, monospace`,
      fontSize,
      lineHeight: 1.4,
      cursorBlink,
      cursorStyle,
      scrollback,
      allowTransparency: false,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    // Delay fit to let the absolute-positioned parent fully lay out
    fitAddon.fit()
    requestAnimationFrame(() => fitAddon.fit())

    // Force slim scrollbar directly on the xterm viewport element (CSS alone is overridden by xterm)
    const viewport = containerRef.current.querySelector('.xterm-viewport') as HTMLElement | null
    if (viewport) {
      viewport.style.scrollbarWidth = 'thin'
      viewport.style.scrollbarColor = isDark
        ? 'rgba(255,255,255,0.2) transparent'
        : 'rgba(0,0,0,0.2) transparent'
    }

    termRef.current = term
    fitRef.current = fitAddon

    const { cols, rows } = term

    let connectedNotified = false

    const unlistenOutput = listen<string>(`ssh-output-${sessionId}`, (e) => {
      const text = e.payload
      if (!connectedNotified) {
        connectedNotified = true
        onConnectedRef.current?.()
        // Detect OS in background (key/agent auth only) and cache it
        const h = hostRef.current
        if (h.auth_type !== 'password' && h.id && !h.os_type) {
          setTimeout(() => {
            invoke<string>('ssh_exec', {
              host: h.host, port: h.port, username: h.user,
              authType: h.auth_type ?? 'agent',
              privateKeyPath: h.private_key_path ?? null,
              command: 'cat /etc/os-release 2>/dev/null | grep -E "^ID=" | head -1 | cut -d= -f2 | tr -d \'"\' || uname -s',
            }).then(raw => {
              const os = raw.trim().toLowerCase().replace(/\n.*/s, '')
              if (os) {
                invoke('save_os_type', { id: h.id, osType: os }).catch(console.error)
                useConnections.getState().load()
              }
            }).catch(() => {})
          }, 3000)
        }
      }
      term.write(text)
    })

    const unlistenClose = listen(`ssh-closed-${sessionId}`, () => {
      term.writeln('\r\n\x1b[2m[Connection closed]\x1b[0m')
    })

    term.onData((data) => {
      if (!readyRef.current) return
      invoke('ssh_send_native', { sessionId, input: data }).catch(console.error)
    })

    // Ctrl+Shift+V = paste via Tauri clipboard (no browser permission dialog)
    term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault()
        readText().then(text => {
          if (text && readyRef.current) {
            invoke('ssh_send_native', { sessionId, input: text }).catch(console.error)
          }
        }).catch(console.error)
        return false
      }
      // Ctrl+Shift+C = copy selection
      if (e.type === 'keydown' && e.ctrlKey && e.shiftKey && e.key === 'C') {
        const sel = term.getSelection()
        if (sel) navigator.clipboard.writeText(sel).catch(console.error)
        return false
      }
      return true
    })

    term.onResize(({ cols, rows }) => {
      if (!readyRef.current) return
      invoke('ssh_resize_native', { sessionId, cols, rows }).catch(console.error)
    })

    // Right-click = show custom context menu
    const handleRightClick = (e: MouseEvent) => {
      e.preventDefault()
      const selection = term.getSelection()
      setCtxMenu({ x: e.clientX, y: e.clientY, hasSelection: !!selection, selection })
    }
    containerRef.current.addEventListener('contextmenu', handleRightClick)

    const ro = new ResizeObserver(() => { fitAddon.fit() })
    ro.observe(containerRef.current)

    // Start SSH AFTER listeners are registered
    const h = hostRef.current

    // Wait briefly to ensure Tauri event listeners are fully registered before spawning SSH
    setTimeout(() => {
      invoke('ssh_connect_native', {
        request: {
          session_id: sessionId,
          host: h.host,
          port: h.port,
          username: h.user,
          auth_type: h.auth_type ?? 'agent',
          password: h.password ?? null,
          private_key_path: h.private_key_path ?? null,
          cols,
          rows,
        },
      }).then(() => {
        readyRef.current = true
      }).catch((err: unknown) => {
        const msg = String(err)
        term.writeln('\x1b[31m✗ ' + msg + '\x1b[0m')
        term.writeln('\x1b[2mPress any key to close this tab.\x1b[0m')
        term.onKey(() => onCloseRef.current())
      })
    }, 50)

    return () => {
      containerRef.current?.removeEventListener('contextmenu', handleRightClick)
      ro.disconnect()
      unlistenOutput.then(fn => fn())
      unlistenClose.then(fn => fn())
      if (readyRef.current) {
        invoke('ssh_disconnect_native', { sessionId }).catch(console.error)
      }
      term.dispose()
    }
  // Only re-connect if the actual target server changes, not on every store re-render
  }, [sessionId, host.host, host.port, host.user])

  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      termRef.current?.focus()
    }
  }, [active])

  // Apply settings changes live without remounting
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontSize = termSettings.fontSize
    term.options.fontFamily = `'${termSettings.fontFamily}', 'JetBrains Mono', ui-monospace, monospace`
    term.options.cursorStyle = termSettings.cursorStyle
    term.options.cursorBlink = termSettings.cursorBlink
    fitRef.current?.fit()
  }, [termSettings.fontSize, termSettings.fontFamily, termSettings.cursorStyle, termSettings.cursorBlink])

  const isDark = (theme ?? document.body.dataset.theme) === 'dark'
  const bg = isDark ? DARK_THEME.background : LIGHT_THEME.background

  return (
    <div style={{
      position: 'absolute', inset: 0, background: bg,
      visibility: active ? 'visible' : 'hidden',
      pointerEvents: active ? 'auto' : 'none',
      zIndex: active ? 1 : 0,
    }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', padding: '4px 8px' }} />

      {/* Terminal right-click context menu */}
      {ctxMenu && (
        <TerminalContextMenu
          x={ctxMenu.x} y={ctxMenu.y}
          hasSelection={ctxMenu.hasSelection}
          onCopy={() => {
            if (ctxMenu.selection) navigator.clipboard.writeText(ctxMenu.selection).catch(() => {})
            setCtxMenu(null)
          }}
          onCopyAll={() => {
            const term = termRef.current
            if (term) { term.selectAll(); const all = term.getSelection(); term.clearSelection(); navigator.clipboard.writeText(all).catch(() => {}) }
            setCtxMenu(null)
          }}
          onPaste={async () => {
            try {
              const text = await readText()
              if (text && readyRef.current) invoke('ssh_send_native', { sessionId, input: text }).catch(console.error)
            } catch { /* ignore */ }
            setCtxMenu(null)
          }}
          onSelectAll={() => { termRef.current?.selectAll(); setCtxMenu(null) }}
          onClear={() => { termRef.current?.clear(); setCtxMenu(null) }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  )
}

function TerminalContextMenu({ x, y, hasSelection, onCopy, onCopyAll, onPaste, onSelectAll, onClear, onClose }: {
  x: number; y: number; hasSelection: boolean
  onCopy: () => void; onCopyAll: () => void; onPaste: () => void
  onSelectAll: () => void; onClear: () => void; onClose: () => void
}) {
  // Adjust position so menu doesn't go off screen
  const menuW = 180, menuH = 200
  const left = Math.min(x, window.innerWidth - menuW - 8)
  const top = Math.min(y, window.innerHeight - menuH - 8)

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={onClose} />
      <div style={{
        position: 'fixed', left, top, zIndex: 999,
        background: 'var(--bg-1)', border: '1px solid var(--border)',
        borderRadius: 7, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: '4px 0', minWidth: menuW, fontSize: 12.5,
      }}>
        <MenuItem label="Copy" shortcut="Ctrl+Shift+C" disabled={!hasSelection} onClick={onCopy} />
        <MenuItem label="Copy all" onClick={onCopyAll} />
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <MenuItem label="Paste" shortcut="Ctrl+Shift+V" onClick={onPaste} />
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        <MenuItem label="Select all" onClick={onSelectAll} />
        <MenuItem label="Clear" onClick={onClear} />
      </div>
    </>
  )
}

function MenuItem({ label, shortcut, disabled, onClick }: { label: string; shortcut?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '6px 14px', border: 'none', background: 'transparent',
        color: disabled ? 'var(--text-4)' : 'var(--text-1)', cursor: disabled ? 'default' : 'pointer',
        fontSize: 12.5, textAlign: 'left', gap: 20,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
      <span>{label}</span>
      {shortcut && <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>{shortcut}</span>}
    </button>
  )
}
