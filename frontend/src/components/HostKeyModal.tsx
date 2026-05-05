import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface Props {
  host: string
  port: number
  onAccept: () => void
  onCancel: () => void
}

export function HostKeyModal({ host, port, onAccept, onCancel }: Props) {
  const [fingerprint, setFingerprint] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    invoke<string>('scan_host_fingerprint', { host, port })
      .then(fp => { setFingerprint(fp); setLoading(false) })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [host, port])

  const handleAccept = async () => {
    // Always save — use fingerprint if available, otherwise mark as manually accepted
    const fp = fingerprint ?? `manually-accepted-${Date.now()}`
    await invoke('accept_host_key', { host, port, fingerprint: fp }).catch(console.error)
    onAccept()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 480, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🔐</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Unknown host key</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{host}:{port}</div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 18px' }}>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            It seems to be the first time you connect to this server — the remote server identity is not yet known by Tesseract.
          </p>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
            Press <strong>Accept</strong> if you trust this identity and want to carry on connecting.<br />
            Press <strong>Cancel</strong> if you want to abandon this connection.
          </p>

          {/* Fingerprint */}
          <div style={{ padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11.5, marginBottom: 16 }}>
            <div style={{ color: 'var(--text-3)', marginBottom: 4 }}>Host key fingerprint:</div>
            {loading && <div style={{ color: 'var(--text-4)' }}>Scanning…</div>}
            {error && <div style={{ color: '#ff7b72' }}>Could not retrieve fingerprint: {error}</div>}
            {fingerprint && <div style={{ color: 'var(--text-1)', wordBreak: 'break-all' }}>{fingerprint}</div>}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onCancel} style={{ padding: '6px 16px', border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-2)', fontSize: 12.5, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleAccept} disabled={loading} style={{ padding: '6px 16px', border: 'none', borderRadius: 6, background: 'var(--text-1)', color: 'var(--bg-1)', fontSize: 12.5, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
