import { useState, useEffect, useRef, useMemo } from 'react'
import { I } from '../ui/icons'
import { StatusDot, Kbd } from '../ui/primitives'
import { useConnections } from '../store/connections'

interface PaletteProps {
  onClose: () => void
  onNavigate: (r: string) => void
  onConnect: (id: string) => void
  onTheme: () => void
}

export const Palette = ({ onClose, onNavigate, onConnect, onTheme }: PaletteProps) => {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { connections, snippets } = useConnections()

  useEffect(() => { inputRef.current?.focus() }, [])

  const items = useMemo(() => {
    const base = [
      ...connections.map(h => ({
        id: 'host-' + h.id, kind: 'Host', label: h.name,
        sub: (`${h.user}@${h.host}` + (h.port !== 22 ? `:${h.port}` : '')) as string | undefined,
        icon: <StatusDot status={h.status} />,
        action: () => onConnect(h.id),
      })),
      { id: 'act-new', kind: 'Action', label: 'New connection…', sub: 'Open the new connection form' as string | undefined, icon: <I.Plus />, action: () => onNavigate('new') },
      { id: 'act-dash', kind: 'Action', label: 'Go to Dashboard', sub: undefined as string | undefined, icon: <I.Dashboard />, action: () => onNavigate('dashboard') },
      { id: 'act-keys', kind: 'Action', label: 'Manage keys', sub: undefined as string | undefined, icon: <I.Key />, action: () => onNavigate('keys') },
      { id: 'act-set', kind: 'Action', label: 'Open settings', sub: undefined as string | undefined, icon: <I.Settings />, action: () => onNavigate('settings') },
      { id: 'act-theme', kind: 'Action', label: 'Toggle theme', sub: undefined as string | undefined, icon: <I.Sun />, action: onTheme },
      ...snippets.map(s => ({
        id: 'snip-' + s.name, kind: 'Snippet', label: s.name, sub: s.cmd as string | undefined,
        icon: <I.Bolt />, action: () => {},
      })),
    ]
    const t = q.trim().toLowerCase()
    if (!t) return base
    return base.filter(i =>
      i.label.toLowerCase().includes(t) ||
      (i.sub || '').toLowerCase().includes(t) ||
      i.kind.toLowerCase().includes(t)
    )
  }, [q, connections, snippets, onConnect, onNavigate, onTheme])

  useEffect(() => { setIdx(0) }, [q])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[idx]?.action(); onClose() }
    else if (e.key === 'Escape') { onClose() }
  }

  const grouped: Array<{ heading?: string; item?: typeof items[0]; origIdx?: number }> = []
  let lastKind: string | null = null
  items.forEach((it, i) => {
    if (it.kind !== lastKind) { grouped.push({ heading: it.kind }); lastKind = it.kind }
    grouped.push({ item: it, origIdx: i })
  })

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 580, maxWidth: '92%', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', borderBottom: '1px solid var(--border)', height: 'var(--tw-palette-h, 68px)' }}>
          <span style={{ color: 'var(--text-3)', display: 'inline-flex', marginRight: 14 }}><I.Search size={20} /></span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Type a command, host, or snippet…"
            style={{ flex: 1, height: '100%', border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-1)', fontSize: 17, fontFamily: 'var(--font-ui)' }} />
          <Kbd>esc</Kbd>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {items.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No results for "{q}"</div>}
          {grouped.map((g, i) => g.heading
            ? <div key={'h-' + i} style={{ padding: '10px 14px 4px', fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--text-4)', textTransform: 'uppercase' }}>{g.heading}</div>
            : <button key={g.item!.id} onClick={() => { g.item!.action(); onClose() }}
                onMouseEnter={() => setIdx(g.origIdx!)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer', background: g.origIdx === idx ? 'var(--bg-active)' : 'transparent', color: 'var(--text-1)' }}>
                <span style={{ display: 'inline-flex', color: 'var(--text-3)', width: 16, justifyContent: 'center' }}>{g.item!.icon}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 450 }}>{g.item!.label}</div>
                  {g.item!.sub && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.item!.sub}</div>}
                </span>
                {g.origIdx === idx && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-4)', fontSize: 11 }}><I.CornerArrow size={12} /> open</span>}
              </button>
          )}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>↑</Kbd><Kbd>↓</Kbd> navigate</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Kbd>↵</Kbd> open</span>
          <span style={{ flex: 1 }} />
          <span>{items.length} results</span>
        </div>
      </div>
    </div>
  )
}
