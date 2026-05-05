import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string
  active: boolean
  theme?: string
}

const DARK_THEME = {
  background: '#0d1117', foreground: '#c9d1d9', cursor: '#c9d1d9', cursorAccent: '#0d1117',
  selectionBackground: '#388bfd33',
  black: '#0d1117', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
  blue: '#58a6ff', magenta: '#bc8cff', cyan: '#76e3ea', white: '#c9d1d9',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
  brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
  brightCyan: '#b3f0ff', brightWhite: '#ffffff',
}

const LIGHT_THEME = {
  background: '#f8f9fa', foreground: '#1c1e21', cursor: '#1c1e21', cursorAccent: '#f8f9fa',
  selectionBackground: '#0969da33',
  black: '#1c1e21', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
  blue: '#0550ae', magenta: '#8250df', cyan: '#1b7c83', white: '#6e7781',
  brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37',
  brightYellow: '#633c01', brightBlue: '#0969da', brightMagenta: '#6639ba',
  brightCyan: '#1b7c83', brightWhite: '#24292f',
}

export function LocalTerminalPane({ sessionId, active, theme }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const readyRef = useRef(false)
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const isDark = (theme ?? document.body.dataset.theme) === 'dark'
    term.options.theme = isDark ? DARK_THEME : LIGHT_THEME
    forceUpdate(n => n + 1)
  }, [theme])

  useEffect(() => {
    if (!containerRef.current) return

    const isDark = (theme ?? document.body.dataset.theme) === 'dark'

    const term = new Terminal({
      theme: isDark ? DARK_THEME : LIGHT_THEME,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      copyOnSelect: true,
      rightClickSelectsWord: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()
    requestAnimationFrame(() => fitAddon.fit())

    termRef.current = term
    fitRef.current = fitAddon

    const { cols, rows } = term

    invoke('local_terminal_connect', { sessionId, cols, rows }).then(() => {
      readyRef.current = true
    }).catch((err: unknown) => {
      term.writeln('\x1b[31m✗ Failed to open local terminal: ' + String(err) + '\x1b[0m')
    })

    const unlisten = listen<string>(`ssh-output-${sessionId}`, (e) => {
      term.write(e.payload)
    })

    const unlistenClose = listen(`ssh-closed-${sessionId}`, () => {
      term.writeln('\r\n\x1b[2m[Shell exited]\x1b[0m')
    })

    term.onData((data) => {
      if (!readyRef.current) return
      invoke('ssh_send_native', { sessionId, input: data }).catch(console.error)
    })

    term.onResize(({ cols, rows }) => {
      if (!readyRef.current) return
      invoke('ssh_resize_native', { sessionId, cols, rows }).catch(console.error)
    })

    const ro = new ResizeObserver(() => { fitAddon.fit() })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      unlisten.then(fn => fn())
      unlistenClose.then(fn => fn())
      if (readyRef.current) {
        invoke('ssh_disconnect_native', { sessionId }).catch(console.error)
      }
      term.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    if (active) {
      fitRef.current?.fit()
      termRef.current?.focus()
    }
  }, [active])

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
    </div>
  )
}
