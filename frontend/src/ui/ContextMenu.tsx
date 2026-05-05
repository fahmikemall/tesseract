import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onClick: () => void
  danger?: boolean
  divider?: boolean
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export const ContextMenu = ({ x, y, items, onClose }: Props) => {
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click or Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Clamp to viewport
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.right > window.innerWidth) el.style.left = (x - r.width) + 'px'
    if (r.bottom > window.innerHeight) el.style.top = (y - r.height) + 'px'
  }, [x, y])

  return (
    <div ref={ref} style={{
      position: 'fixed', left: x, top: y, zIndex: 1000,
      minWidth: 180, background: 'var(--bg-1)',
      border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: 'var(--shadow-lg)',
      padding: '4px 0', overflow: 'hidden',
    }}>
      {items.map((item, i) => item.divider ? (
        <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      ) : (
        <button key={i} onClick={() => { if (!item.disabled) { item.onClick(); onClose() } }}
          disabled={item.disabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent',
            color: item.danger ? '#ff7b72' : item.disabled ? 'var(--text-4)' : 'var(--text-1)',
            fontSize: 12.5, cursor: item.disabled ? 'default' : 'pointer',
            textAlign: 'left', opacity: item.disabled ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          {item.icon && (
            <span style={{ color: item.danger ? '#ff7b72' : 'var(--text-3)', display: 'inline-flex' }}>
              {item.icon}
            </span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  )
}
