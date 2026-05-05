// Tesseract mark — primary: wireframe (outer cube + inner cube + connectors)
// Built on an 8-unit grid. off = 26% of size. Works 16px → 120px.

interface MarkProps {
  size?: number
  stroke?: number
  color?: string
}

export const MarkWireframe = ({ size = 96, stroke = 1.6, color = 'currentColor' }: MarkProps) => {
  const s = size
  const off = s * 0.26
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none"
      stroke={color} strokeWidth={stroke} strokeLinecap="square" strokeLinejoin="miter">
      {/* outer */}
      <rect x={stroke / 2} y={stroke / 2} width={s - stroke} height={s - stroke} />
      {/* inner */}
      <rect x={off} y={off} width={s - off * 2} height={s - off * 2} />
      {/* connectors — 4 corners */}
      <line x1={stroke / 2} y1={stroke / 2} x2={off} y2={off} />
      <line x1={s - stroke / 2} y1={stroke / 2} x2={s - off} y2={off} />
      <line x1={stroke / 2} y1={s - stroke / 2} x2={off} y2={s - off} />
      <line x1={s - stroke / 2} y1={s - stroke / 2} x2={s - off} y2={s - off} />
    </svg>
  )
}

// Wordmark: "tesseract" in Inter, tight tracking
export const Wordmark = ({
  size = 28,
  weight = 500,
  color = 'currentColor',
  mono = false,
}: {
  size?: number
  weight?: number
  color?: string
  mono?: boolean
}) => (
  <span style={{
    fontFamily: mono
      ? "'JetBrains Mono', ui-monospace, monospace"
      : "'Inter', system-ui, sans-serif",
    fontSize: size,
    fontWeight: weight,
    color,
    letterSpacing: mono ? '-0.01em' : '-0.02em',
    lineHeight: 1,
  }}>tesseract</span>
)

// Horizontal lockup — mark + wordmark side by side
export const LogoLockup = ({
  size = 22,
  color = 'currentColor',
  gap = 10,
  showTagline = false,
}: {
  size?: number
  color?: string
  gap?: number
  showTagline?: boolean
}) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap }}>
    <MarkWireframe size={size} color={color} stroke={size * 0.017} />
    <div style={{ display: 'flex', flexDirection: 'column', gap: showTagline ? 3 : 0 }}>
      <Wordmark size={size * 0.65} color={color} />
      {showTagline && (
        <span style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: size * 0.28, color, opacity: 0.5,
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>SSH client · v1.0</span>
      )}
    </div>
  </div>
)
