import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { v4 as uuidv4 } from 'uuid'
import { I } from '../ui/icons'
import { Button, IconBtn, Field, Input, Select } from '../ui/primitives'
import { useConnections } from '../store/connections'

interface SshKeyInfo { name: string; path: string; key_type: string; comment: string }

interface ConnectFlowProps {
  onClose: () => void
  onConnected: () => void
  defaultGroup?: string
}

export const ConnectFlow = ({ onClose, onConnected, defaultGroup }: ConnectFlowProps) => {
  const { groups: storeGroups, load: reloadStore } = useConnections()
  const [localGroups, setLocalGroups] = useState<string[]>([])
  const [dbGroups, setDbGroups] = useState<string[]>([])
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  // All groups = DB groups + store groups + locally added (deduped)
  const groups = [...new Set([...dbGroups, ...storeGroups, ...localGroups])].filter(Boolean)

  // Sync selected group to first available when groups load in
  useEffect(() => {
    if (groups.length > 0 && !data.group) {
      setData(d => ({ ...d, group: defaultGroup ?? groups[0] }))
    }
  }, [groups.length])

  const [stage, setStage] = useState<'form' | 'connecting' | 'connected' | 'error'>('form')
  const testSessionId = useRef<string | null>(null)
  const [data, setData] = useState({
    name: '', host: '', user: 'root', port: 22,
    group: defaultGroup ?? (storeGroups[0] || ''), auth: 'agent', key: '', password: '', passphrase: '',
  })
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [realKeys, setRealKeys] = useState<SshKeyInfo[]>([])
  const [generating, setGenerating] = useState(false)
  const [newKeyName, setNewKeyName] = useState('id_ed25519_new')

  // Load groups + keys fresh from DB when panel opens
  useEffect(() => {
    invoke<string[]>('get_groups').then(g => {
      setDbGroups(g)
      // Set default group if not already set via defaultGroup prop
      if (!defaultGroup && g.length > 0) {
        setData(d => ({ ...d, group: d.group || g[0] }))
      }
    }).catch(console.error)

    invoke<SshKeyInfo[]>('get_ssh_keys').then(keys => {
      setRealKeys(keys)
      if (keys.length > 0) {
        setData(d => ({ ...d, key: keys[0].path, auth: 'key' }))
      }
    }).catch(console.error)
  }, [])

  // No fake animation — real SSH connection handles progress

  const update = (k: string, v: string | number) => setData(d => ({ ...d, [k]: v }))

  // Close only on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [onClose])

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    setProgressLines([])
    setErrorMsg('')
    setStage('connecting')

    const connId = crypto.randomUUID()
    const sessionId = uuidv4()
    testSessionId.current = sessionId

    const addLine = (line: string) => setProgressLines(p => [...p, line])

    addLine(`→ Connecting to ${data.user}@${data.host}:${data.port}`)

    try {
      addLine('→ Starting SSH session...')
      await invoke('ssh_connect_native', {
        request: {
          session_id: sessionId,
          host: data.host,
          port: data.port,
          username: data.user,
          auth_type: data.auth,
          password: data.auth === 'password' ? data.password : null,
          private_key_path: data.auth === 'key' ? data.key : null,
          cols: 80,
          rows: 24,
        },
      })

      // Watch output and handle prompts; detect success or failure
      addLine('→ Authenticating...')
      await new Promise<void>((resolve, reject) => {
        let settled = false
        let passwordSent = false
        let passphraseSent = false
        const outputBuf: string[] = []

        const cleanup = (unlistenOutput: () => void, unlistenClose: () => void, timer: ReturnType<typeof setTimeout>) => {
          clearTimeout(timer)
          unlistenOutput()
          unlistenClose()
        }

        // Timeout after 10s
        let unlistenOutput: () => void = () => {}
        let unlistenClose: () => void = () => {}

        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          // If we had output but no error, treat as success
          if (outputBuf.length > 0) {
            cleanup(unlistenOutput, unlistenClose, timer)
            resolve()
          } else {
            cleanup(unlistenOutput, unlistenClose, timer)
            reject(new Error('Connection timed out'))
          }
        }, 10000)

        listen<string>(`ssh-output-${sessionId}`, (e) => {
          if (settled) return
          const text = e.payload
          outputBuf.push(text)

          // Handle password prompt — send stored password automatically
          if (/[Pp]assword:/.test(text) && !passwordSent) {
            if (data.auth === 'password' && data.password) {
              passwordSent = true
              invoke('ssh_send_native', { sessionId, input: data.password + '\n' }).catch(() => {})
            } else if (data.auth === 'agent' || data.auth === 'key') {
              // Key auth failed, server wants password but we don't have one
              settled = true
              cleanup(unlistenOutput, unlistenClose, timer)
              reject(new Error('Key authentication failed. Server requires a password.\nSwitch to "Password" auth type and enter your password.'))
            }
            return
          }

          // Handle passphrase prompt
          if (!passphraseSent && /[Ee]nter passphrase/i.test(text) && data.auth === 'key' && data.passphrase) {
            passphraseSent = true
            invoke('ssh_send_native', { sessionId, input: data.passphrase + '\n' }).catch(() => {})
            return
          }

          // Final auth failure — "Permission denied" AFTER password was sent = wrong password
          if (passwordSent && /Permission denied/i.test(text)) {
            settled = true
            cleanup(unlistenOutput, unlistenClose, timer)
            reject(new Error('Wrong password. Please check your credentials.'))
            return
          }

          // Network/host errors
          if (/Connection refused|No route to host|Name or service not known|Could not resolve|ssh: connect/i.test(text)) {
            settled = true
            cleanup(unlistenOutput, unlistenClose, timer)
            reject(new Error(text.trim()))
            return
          }

          // Shell output (not a prompt) = success
          const isPrompt = /[Pp]assword:|passphrase|yes\/no|fingerprint|\(yes\/no\)/i.test(text)
          if (!isPrompt && outputBuf.length > 0) {
            // For password auth: only success after we sent password
            const readyForSuccess = data.auth !== 'password' || passwordSent
            if (readyForSuccess) {
              setTimeout(() => {
                if (!settled) {
                  settled = true
                  cleanup(unlistenOutput, unlistenClose, timer)
                  resolve()
                }
              }, 600)
            }
          }
        }).then(fn => { unlistenOutput = fn })

        listen(`ssh-closed-${sessionId}`, () => {
          if (settled) return
          settled = true
          cleanup(unlistenOutput, unlistenClose, timer)
          reject(new Error('Connection closed before authentication completed'))
        }).then(fn => { unlistenClose = fn })
      })

      invoke('ssh_disconnect_native', { sessionId }).catch(() => {})
      testSessionId.current = null

      addLine('✓ Authentication accepted')
      addLine('✓ Shell access confirmed')

      // Ensure group exists in DB before saving connection
      if (data.group) await invoke('upsert_group', { name: data.group }).catch(() => {})

      await invoke('save_connection', {
        conn: {
          id: connId,
          name: data.name || `${data.user}@${data.host}`,
          host: data.host,
          port: data.port,
          username: data.user,
          auth_type: data.auth,
          password: data.auth === 'password' ? data.password : null,
          private_key_path: data.auth === 'key' ? data.key : null,
          passphrase: (data.auth === 'key' && data.passphrase) ? data.passphrase : null,
          group: data.group,
        },
      })
      await useConnections.getState().load()

      setTimeout(() => setStage('connected'), 400)

    } catch (err) {
      invoke('ssh_disconnect_native', { sessionId }).catch(() => {})
      testSessionId.current = null

      const msg = String(err)
      addLine(`✗ ${msg}`)
      setErrorMsg(msg)
      setTimeout(() => setStage('error'), 200)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const result = await invoke<SshKeyInfo>('generate_ssh_key', {
        keyName: newKeyName,
        comment: `${data.user || 'user'}@tesseract`,
      })
      setRealKeys(prev => [...prev, result])
      update('key', result.path)
      update('auth', 'key')
    } catch (err) {
      alert(`Key generation failed: ${err}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'oklch(0 0 0 / 0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 580, maxWidth: '100%', maxHeight: '90vh', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {stage === 'form' ? 'New connection' : stage === 'connecting' ? 'Connecting…' : stage === 'connected' ? 'Connected' : 'Connection failed'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
              {stage === 'form' ? 'Connection details are saved to your hosts list.' : `${data.user}@${data.host}:${data.port}`}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <IconBtn icon={<I.X size={12} />} onClick={onClose} title="Close" />
        </div>

        {/* Form */}
        {stage === 'form' && (
          <form onSubmit={handleConnect} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto' }}>
            <Field label="Name (optional)">
              <Input placeholder={`${data.user || 'user'}@${data.host || 'host'}` } value={data.name} onChange={e => update('name', e.target.value)} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
              <Field label="Host">
                <Input placeholder="hostname or IP" value={data.host} onChange={e => update('host', e.target.value)} mono required />
              </Field>
              <Field label="Port">
                <Input type="number" value={data.port} onChange={e => update('port', parseInt(e.target.value) || 22)} mono />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Username">
                <Input value={data.user} onChange={e => update('user', e.target.value)} mono required />
              </Field>
              <Field label="Group">
                {addingGroup ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Input
                      autoFocus
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newGroupName.trim()) {
                          const g = newGroupName.trim()
                          setLocalGroups(prev => [...new Set([...prev, g])])
                          update('group', g)
                          setNewGroupName('')
                          setAddingGroup(false)
                        } else if (e.key === 'Escape') {
                          setAddingGroup(false)
                          setNewGroupName('')
                        }
                      }}
                      placeholder="Group name, Enter to confirm"
                      style={{ flex: 1 }}
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setAddingGroup(false); setNewGroupName('') }}>
                      <I.X size={12} />
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Select value={data.group} onChange={e => update('group', e.target.value)} style={{ flex: 1 }}>
                      {groups.map(g => <option key={g}>{g}</option>)}
                    </Select>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAddingGroup(true)}>
                      <I.Plus size={12} />
                    </Button>
                    {groups.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => {
                        setLocalGroups(prev => prev.filter(g => g !== data.group))
                        update('group', groups.filter(g => g !== data.group)[0] ?? '')
                      }} style={{ color: 'var(--text-4)' }}>
                        <I.Trash size={12} />
                      </Button>
                    )}
                  </div>
                )}
              </Field>
            </div>

            {/* Auth method */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>Authentication</div>
              <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, padding: 2, background: 'var(--bg-2)', width: 'fit-content' }}>
                {[['agent', 'SSH agent / ~/.ssh'], ['key', 'Choose key'], ['password', 'Password']].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => update('auth', k)} style={{ padding: '5px 12px', height: 26, border: 'none', borderRadius: 4, background: data.auth === k ? 'var(--bg-0)' : 'transparent', color: data.auth === k ? 'var(--text-1)' : 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', boxShadow: data.auth === k ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
                ))}
              </div>
            </div>

            {data.auth === 'agent' && (
              <div style={{ padding: '10px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-3)' }}>
                <div style={{ fontWeight: 500, color: 'var(--text-2)', marginBottom: 4 }}>Auto-discover from ~/.ssh</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  Tesseract will try all keys in <code>~/.ssh</code> automatically.
                  {realKeys.length > 0
                    ? ` Found: ${realKeys.map(k => k.name).join(', ')}`
                    : ' No keys found — add one below.'}
                </div>
                {realKeys.length === 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} mono style={{ maxWidth: 180, height: 28, fontSize: 12 }} />
                    <Button type="button" variant="subtle" size="sm" onClick={handleGenerate} disabled={generating}>
                      <I.Key size={12} /> {generating ? 'Generating…' : 'Generate ED25519'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {data.auth === 'key' && (
              <Field label="Private key">
                {realKeys.length > 0 ? (
                  <Select value={data.key} onChange={e => update('key', e.target.value)}>
                    {realKeys.map(k => (
                      <option key={k.path} value={k.path}>{k.name} — {k.key_type} — {k.comment}</option>
                    ))}
                  </Select>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
                    <Input value={data.key} onChange={e => update('key', e.target.value)} mono placeholder="~/.ssh/id_ed25519" />
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                      No keys found in ~/.ssh.{' '}
                      <button type="button" onClick={handleGenerate} disabled={generating}
                        style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', textDecoration: 'underline', fontSize: 11.5 }}>
                        {generating ? 'Generating…' : 'Generate a new ED25519 key'}
                      </button>
                    </div>
                  </div>
                )}
              </Field>
            )}

            {data.auth === 'key' && (
              <Field label="Passphrase" hint="Leave empty if your key has no passphrase">
                <Input type="password" value={data.passphrase} onChange={e => update('passphrase', e.target.value)} placeholder="Key passphrase (if any)" />
              </Field>
            )}

            {data.auth === 'password' && (
              <Field label="Password">
                <Input type="password" value={data.password} onChange={e => update('password', e.target.value)} placeholder="••••••••" />
              </Field>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                {data.user || 'user'}@{data.host || 'host'}:{data.port}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
                <Button variant="primary" type="submit">Connect <I.ArrowRight size={12} /></Button>
              </div>
            </div>
          </form>
        )}

        {/* Connecting */}
        {(stage === 'connecting' || stage === 'error') && (
          <div style={{ padding: 20 }}>
            <div style={{ background: 'var(--term-bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '14px 16px', minHeight: 180, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--term-fg)' }}>
              {progressLines.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('✓') ? 'var(--term-accent)' : l.startsWith('✗') ? '#ff7b72' : 'var(--term-fg)', lineHeight: 1.7 }}>{l}</div>
              ))}
              {stage === 'connecting' && <div style={{ display: 'inline-block', width: 7, height: 13, background: 'var(--term-accent)', verticalAlign: '-2px' }} />}
            </div>
            {stage === 'error' && errorMsg && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,123,114,0.08)', border: '1px solid rgba(255,123,114,0.3)', borderRadius: 6, fontSize: 12, color: '#ff7b72', fontFamily: 'var(--font-mono)' }}>
                {errorMsg}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14, gap: 8 }}>
              {stage === 'error' && <Button variant="subtle" onClick={() => setStage('form')}>← Back</Button>}
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Connected */}
        {stage === 'connected' && (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, margin: '0 auto 14px', borderRadius: '50%', border: '1.5px solid var(--text-1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-1)' }}>
              <I.Check />
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Connected successfully</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {data.user || 'user'}@{data.host || 'host'}:{data.port}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 18 }}>
              <Button variant="ghost" onClick={onClose}>Close</Button>
              <Button variant="primary" onClick={onConnected}>Open terminal <I.ArrowRight size={12} /></Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
