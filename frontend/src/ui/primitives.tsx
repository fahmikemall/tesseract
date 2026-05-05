import { useState, type CSSProperties, type ReactNode } from 'react'

// Status dot
export const StatusDot = ({ status = 'online', size = 7 }: { status?: string; size?: number }) => {
  const s = {
    online: { bg: 'var(--text-1)', border: 'var(--text-1)' },
    warn: { bg: 'transparent', border: 'var(--text-2)' },
    offline: { bg: 'transparent', border: 'var(--text-4)' },
  }[status] ?? { bg: 'transparent', border: 'var(--text-4)' }
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: s.bg, border: `1px solid ${s.border}`, flex: '0 0 auto',
    }} />
  )
}

// Button
interface ButtonProps {
  children?: ReactNode
  variant?: 'ghost' | 'subtle' | 'primary' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  onClick?: (e: React.MouseEvent) => void
  style?: CSSProperties
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

export const Button = ({ children, variant = 'ghost', size = 'md', onClick, style, disabled, type = 'button' }: ButtonProps) => {
  const sizes = {
    sm: { padding: '5px 8px', fontSize: 12, height: 24 },
    md: { padding: '7px 10px', fontSize: 12.5, height: 28 },
    lg: { padding: '9px 14px', fontSize: 13, height: 34 },
  }
  const variants = {
    ghost: { color: 'var(--text-2)' },
    subtle: { background: 'var(--bg-2)', color: 'var(--text-1)', borderColor: 'var(--border)' },
    primary: { background: 'var(--text-1)', color: 'var(--bg-0)', borderColor: 'var(--text-1)' },
    outline: { color: 'var(--text-1)', borderColor: 'var(--border-strong)' },
  }
  const hovers = {
    ghost: { background: 'var(--bg-hover)', color: 'var(--text-1)' },
    subtle: { background: 'var(--bg-hover)' },
    primary: { background: 'var(--text-2)' },
    outline: { background: 'var(--bg-hover)' },
  }
  const [h, setH] = useState(false)
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        border: '1px solid transparent', borderRadius: 6,
        background: 'transparent', fontWeight: 500, lineHeight: 1, cursor: 'pointer',
        transition: 'background 80ms, border-color 80ms, color 80ms',
        fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap',
        ...sizes[size], ...variants[variant],
        ...(h && !disabled ? hovers[variant] : {}),
        opacity: disabled ? 0.5 : 1, ...style,
      }}>{children}</button>
  )
}

// Icon button
interface IconBtnProps {
  icon: ReactNode
  title?: string
  onClick?: () => void
  active?: boolean
  size?: number
  style?: CSSProperties
}

export const IconBtn = ({ icon, title, onClick, active, size = 28, style }: IconBtnProps) => {
  const [h, setH] = useState(false)
  return (
    <button title={title} onClick={onClick}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--bg-active)' : (h ? 'var(--bg-hover)' : 'transparent'),
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        border: '1px solid transparent', borderRadius: 6, cursor: 'pointer',
        transition: 'background 80ms, color 80ms', ...style,
      }}>{icon}</button>
  )
}

// Kbd
export const Kbd = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, padding: '0 5px',
    fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 500,
    color: 'var(--text-3)', background: 'var(--bg-2)',
    border: '1px solid var(--border)', borderRadius: 4, lineHeight: 1, ...style,
  }}>{children}</span>
)

// Section label
export const SectionLabel = ({ children, right, style }: { children: ReactNode; right?: ReactNode; style?: CSSProperties }) => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 12px', height: 24,
    fontSize: 10.5, fontWeight: 500, letterSpacing: '0.06em',
    color: 'var(--text-4)', textTransform: 'uppercase', ...style,
  }}>
    <span>{children}</span>
    {right}
  </div>
)

// Field
export const Field = ({ label, children, hint, style }: { label?: string; children: ReactNode; hint?: string; style?: CSSProperties }) => (
  <label style={{ display: 'block', ...style }}>
    {label && <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>{label}</div>}
    {children}
    {hint && <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{hint}</div>}
  </label>
)

// Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean
}

export const Input = ({ style, mono, ...rest }: InputProps) => (
  <input style={{
    width: '100%', padding: '8px 10px', height: 32,
    background: 'var(--bg-0)', color: 'var(--text-1)',
    border: '1px solid var(--border)', borderRadius: 6,
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-ui)',
    fontSize: 13, outline: 'none', ...style,
  }} {...rest} />
)

// Password Input with themed show/hide toggle
export const PasswordInput = ({ style, ...rest }: Omit<InputProps, 'type'>) => {
  const [show, setShow] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={show ? 'text' : 'password'}
        style={{
          width: '100%', padding: '8px 36px 8px 10px', height: 32,
          background: 'var(--bg-0)', color: 'var(--text-1)',
          border: '1px solid var(--border)', borderRadius: 6,
          fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none', ...style,
        }}
        {...rest}
      />
      <button type="button" onClick={() => setShow(v => !v)}
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'inline-flex', alignItems: 'center' }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
        {show
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        }
      </button>
    </div>
  )
}

// Select
export const Select = ({ style, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { style?: CSSProperties }) => (
  <select style={{
    width: '100%', padding: '0 28px 0 10px', height: 32,
    background: 'var(--bg-0)', color: 'var(--text-1)',
    border: '1px solid var(--border)', borderRadius: 6,
    fontFamily: 'var(--font-ui)', fontSize: 13, outline: 'none',
    appearance: 'none', WebkitAppearance: 'none',
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%2388898d' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='m4 6 4 4 4-4'/></svg>")`,
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: 14,
    ...style,
  }} {...rest}>{children}</select>
)

// Toggle
export const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button onClick={() => onChange(!checked)} style={{
    width: 32, height: 18, padding: 2, border: '1px solid var(--border-strong)',
    background: checked ? 'var(--text-1)' : 'var(--bg-1)',
    borderRadius: 999, position: 'relative', cursor: 'pointer', transition: 'background 120ms',
  }}>
    <span style={{
      display: 'block', width: 12, height: 12, borderRadius: '50%',
      background: checked ? 'var(--bg-0)' : 'var(--text-3)',
      transform: `translateX(${checked ? 14 : 0}px)`, transition: 'transform 120ms',
    }} />
  </button>
)

// Tag
export const Tag = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center',
    padding: '1px 6px', height: 16, fontSize: 10.5,
    color: 'var(--text-3)', background: 'var(--bg-2)',
    border: '1px solid var(--border)', borderRadius: 3,
    fontFamily: 'var(--font-mono)', letterSpacing: '0.01em', ...style,
  }}>{children}</span>
)
