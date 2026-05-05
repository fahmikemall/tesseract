import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { I } from '../ui/icons'
import { Button, Input, Field } from '../ui/primitives'
import { ContextMenu } from '../ui/ContextMenu'

interface SshKeyInfo {
  name: string
  path: string
  pub_path?: string
  key_type: string
  fingerprint: string
  comment: string
}


// ── Confirm modal ─────────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
    <div onClick={e => e.stopPropagation()} style={{ width: 380, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 24 }}>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="outline" onClick={onConfirm} style={{ color: '#ff7b72', borderColor: 'rgba(255,123,114,0.4)' }}>Delete</Button>
      </div>
    </div>
  </div>
)

// ── Generate key modal ────────────────────────────────────────────────────────
const GenerateModal = ({ onDone, onCancel }: { onDone: (key: SshKeyInfo) => void; onCancel: () => void }) => {
  const [name, setName] = useState('id_ed25519_new')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setLoading(true); setError('')
    try {
      const result = await invoke<SshKeyInfo>('generate_ssh_key', {
        keyName: name,
        comment: comment || `${name}@tesseract`,
      })
      onDone(result)
    } catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Generate SSH key</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Creates an ED25519 key pair in ~/.ssh</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Key name">
            <Input value={name} onChange={e => setName(e.target.value)} mono placeholder="id_ed25519_new" />
          </Field>
          <Field label="Comment (optional)" hint="Usually your email or machine name">
            <Input value={comment} onChange={e => setComment(e.target.value)} placeholder="you@example.com" />
          </Field>
          {error && <div style={{ fontSize: 12, color: '#ff7b72', fontFamily: 'var(--font-mono)', padding: '8px 10px', background: 'rgba(255,123,114,0.08)', borderRadius: 6 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
          <span style={{ fontSize: 11, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>~/.ssh/{name || 'key'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={generate} disabled={loading || !name}>
              <I.Key size={12} /> {loading ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Import key modal ──────────────────────────────────────────────────────────
const ImportModal = ({ onDone, onCancel }: { onDone: (key: SshKeyInfo) => void; onCancel: () => void }) => {
  const [content, setContent] = useState('')
  const [name, setName] = useState('id_imported')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setName(file.name)
    const reader = new FileReader()
    reader.onload = ev => setContent(ev.target?.result as string)
    reader.readAsText(file)
  }

  const importKey = async () => {
    if (!content.trim()) { setError('Paste or select a private key file'); return }
    setLoading(true); setError('')
    try {
      const result = await invoke<SshKeyInfo>('import_ssh_key', { keyName: name, content })
      onDone(result)
    } catch (err) { setError(String(err)) }
    finally { setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: 500, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Import SSH key</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>Import an existing private key into ~/.ssh</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field label="Key name (filename in ~/.ssh)">
            <Input value={name} onChange={e => setName(e.target.value)} mono placeholder="id_ed25519" />
          </Field>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>Private key file</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileChange} />
              <Button variant="subtle" size="sm" onClick={() => fileRef.current?.click()}>
                <I.Upload size={12} /> Select file…
              </Button>
              {name && <span style={{ fontSize: 11.5, color: 'var(--text-3)', alignSelf: 'center', fontFamily: 'var(--font-mono)' }}>{name}</span>}
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Or paste the private key content here&#10;-----BEGIN OPENSSH PRIVATE KEY-----&#10;..."
              style={{ width: '100%', height: 120, padding: '8px 10px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', resize: 'none', outline: 'none', lineHeight: 1.5 }}
            />
          </div>
          {error && <div style={{ fontSize: 12, color: '#ff7b72', fontFamily: 'var(--font-mono)', padding: '8px 10px', background: 'rgba(255,123,114,0.08)', borderRadius: 6 }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={importKey} disabled={loading || !content.trim()}>
            <I.Upload size={12} /> {loading ? 'Importing…' : 'Import'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main KeysView ─────────────────────────────────────────────────────────────
export const KeysView = () => {
  const [keys, setKeys] = useState<SshKeyInfo[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [dropdownKey, setDropdownKey] = useState<{ name: string; x: number; y: number } | null>(null)
  const [deleteKey, setDeleteKey] = useState<SshKeyInfo | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const load = () => {
    setLoading(true)
    invoke<SshKeyInfo[]>('get_ssh_keys')
      .then(k => { setKeys(k); if (k.length > 0 && !sel) setSel(k[0].name) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const k = keys.find(x => x.name === sel)

  const copyPubKey = async () => {
    if (!k) return
    try {
      const content = await invoke<string>('read_file', { path: (k.pub_path || k.path + '.pub') })
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // fallback: copy fingerprint
      await navigator.clipboard.writeText(k.fingerprint)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const confirmDelete = async (key: SshKeyInfo) => {
    try {
      await invoke('delete_ssh_key', { path: key.path })
    } catch {
      // File delete failed, just remove from list
    }
    setKeys(prev => prev.filter(x => x.name !== key.name))
    if (sel === key.name) setSel(keys.find(x => x.name !== key.name)?.name ?? null)
    setDeleteKey(null)
  }

  const copyFingerprint = (fp: string) => {
    navigator.clipboard.writeText(fp)
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-2)' }}>

      {/* Left: key list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
        <div style={{ padding: '20px 28px 12px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>Authentication</div>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 500 }}>Keys & credentials</h1>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 4 }}>
              {loading ? 'Scanning ~/.ssh…' : `${keys.length} key${keys.length !== 1 ? 's' : ''} in ~/.ssh`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <Button variant="ghost" onClick={() => setShowImport(true)}><I.Upload size={12} /> Import</Button>
            <Button variant="primary" onClick={() => setShowGenerate(true)}><I.Plus size={12} /> Generate</Button>
          </div>
        </div>

        <div style={{ padding: '0 28px 24px', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>Scanning ~/.ssh…</div>
          ) : keys.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 12 }}>🔑</div>
              No SSH keys found in ~/.ssh
              <br />
              <button onClick={() => setShowGenerate(true)} style={{ marginTop: 12, display: 'inline-block', fontSize: 12.5, color: 'var(--text-2)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer' }}>
                Generate your first key
              </button>
            </div>
          ) : (
            <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-1)', overflow: 'visible' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 1.2fr 1fr 36px', gap: 12, padding: '8px 16px', fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>
                <span>Name</span><span>Type</span><span>Fingerprint</span><span>Comment</span><span/>
              </div>
              {keys.map((kk, i) => {
                const active = kk.name === sel
                return (
                  <div key={kk.name} style={{ position: 'relative' }}>
                    <button onClick={() => setSel(kk.name)} style={{
                      display: 'grid', gridTemplateColumns: '1.4fr 0.6fr 1.2fr 1fr 36px',
                      gap: 12, alignItems: 'center', padding: '10px 16px', width: '100%',
                      border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                      background: active ? 'var(--bg-active)' : 'transparent',
                      color: 'var(--text-1)', textAlign: 'left', cursor: 'pointer',
                    }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                      <span style={{ fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kk.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{kk.key_type}</span>
                      <button onClick={e => { e.stopPropagation(); copyFingerprint(kk.fingerprint) }}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title="Click to copy fingerprint">
                        {kk.fingerprint}
                      </button>
                      <span style={{ fontSize: 11.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kk.comment}</span>
                      {/* Three dots */}
                      <button onClick={e => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setDropdownKey(dropdownKey?.name === kk.name ? null : { name: kk.name, x: r.right, y: r.bottom + 4 }) }}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', borderRadius: 5 }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <I.More size={14} />
                      </button>
                    </button>

                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: detail panel */}
      {k && (
        <aside style={{ width: 300, flex: '0 0 300px', overflowY: 'auto', overflowX: 'hidden', padding: '24px 20px', background: 'var(--bg-1)', minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Selected key</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{k.name}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginBottom: 18 }}>{k.comment}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 12 }}>
            <span style={{ color: 'var(--text-3)' }}>Type</span><span>{k.key_type}</span>
            <span style={{ color: 'var(--text-3)' }}>Fingerprint</span>
            <button onClick={() => copyFingerprint(k.fingerprint)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all', color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }} title="Click to copy">
              {k.fingerprint}
            </button>
            <span style={{ color: 'var(--text-3)' }}>Private key</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, wordBreak: 'break-all', color: 'var(--text-3)' }}>{k.path}</span>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

          <div style={{ fontSize: 10.5, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Public key</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, lineHeight: 1.55, padding: 10, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-2)', wordBreak: 'break-all', maxHeight: 90, overflow: 'hidden' }}>
            {k.key_type.toLowerCase()}-ed25519 AAAAC3NzaC1lZDI1NTE5… {k.comment}
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <Button variant="subtle" size="sm" style={{ flex: 1, justifyContent: 'center' }} onClick={copyPubKey}>
              {copied ? <><I.Check size={11} /> Copied!</> : <><I.Copy size={11} /> Copy public key</>}
            </Button>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

          <div style={{ padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', overflow: 'hidden' }}>
            <div style={{ marginBottom: 6, color: 'var(--text-4)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Add to server</div>
            <div style={{ wordBreak: 'break-all', lineHeight: 1.6 }}>ssh-copy-id -i {k.path}.pub user@host</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <Button variant="ghost" size="sm" onClick={() => setDeleteKey(k)} style={{ color: '#ff7b72', width: '100%', justifyContent: 'center' }}>
              <I.Trash size={12} /> Delete key
            </Button>
          </div>
        </aside>
      )}

      {/* Three-dots context menu — rendered at fixed position to avoid overflow clipping */}
      {dropdownKey && (
        <ContextMenu
          x={dropdownKey.x} y={dropdownKey.y}
          onClose={() => setDropdownKey(null)}
          items={[
            { label: 'Copy public key', icon: <I.Copy size={13} />, onClick: () => { setSel(dropdownKey.name); copyPubKey() } },
            { label: 'Copy fingerprint', icon: <I.Copy size={13} />, onClick: () => { const kk = keys.find(x => x.name === dropdownKey.name); if (kk) copyFingerprint(kk.fingerprint) } },
            { label: 'Show in explorer', icon: <I.Folder size={13} />, onClick: () => { const kk = keys.find(x => x.name === dropdownKey.name); if (kk) invoke('show_in_explorer', { path: kk.path }).catch(() => {}) } },
            { divider: true, label: '', onClick: () => {} },
            { label: 'Delete', icon: <I.Trash size={13} />, danger: true, onClick: () => { const kk = keys.find(x => x.name === dropdownKey.name); if (kk) setDeleteKey(kk) } },
          ]}
        />
      )}

      {/* Modals */}
      {showGenerate && (
        <GenerateModal
          onDone={key => { setKeys(prev => [...prev, key]); setSel(key.name); setShowGenerate(false) }}
          onCancel={() => setShowGenerate(false)}
        />
      )}
      {showImport && (
        <ImportModal
          onDone={key => { setKeys(prev => [...prev, key]); setSel(key.name); setShowImport(false) }}
          onCancel={() => setShowImport(false)}
        />
      )}
      {deleteKey && (
        <ConfirmModal
          title={`Delete "${deleteKey.name}"?`}
          message={`This will permanently delete the key pair from ~/.ssh. Connected servers that use this key will no longer accept connections.`}
          onConfirm={() => confirmDelete(deleteKey)}
          onCancel={() => setDeleteKey(null)}
        />
      )}
    </div>
  )
}
