import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Session } from '../../types'
import { useAppStore } from '../../store'
import '@xterm/xterm/css/xterm.css'

interface Props {
  session: Session
  active: boolean
}

export function TerminalTab({ session, active }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const unlistenClose = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: '#388bfd33',
        black: '#0d1117',
        red: '#ff7b72',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#76e3ea',
        white: '#c9d1d9',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#b3f0ff',
        brightWhite: '#ffffff',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.loadAddon(new WebLinksAddon())
    term.open(containerRef.current)
    fitAddon.fit()

    termRef.current = term
    fitRef.current = fitAddon

    term.onData((data) => {
      invoke('ssh_send_input', { sessionId: session.id, input: data }).catch(console.error)
    })

    listen<string>(`ssh-output-${session.id}`, (event) => {
      term.write(event.payload)
    }).then((unlisten) => {
      unlistenRef.current = unlisten
    })

    listen(`ssh-closed-${session.id}`, () => {
      term.write('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n')
      useAppStore.getState().updateSession(session.id, { status: 'disconnected' })
    }).then((unlisten) => {
      unlistenClose.current = unlisten
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unlistenRef.current?.()
      unlistenClose.current?.()
      resizeObserver.disconnect()
      term.dispose()
    }
  }, [session.id])

  useEffect(() => {
    if (active && fitRef.current) {
      setTimeout(() => fitRef.current?.fit(), 50)
    }
  }, [active])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ display: active ? 'block' : 'none' }}
    />
  )
}
