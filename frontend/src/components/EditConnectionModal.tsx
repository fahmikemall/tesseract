import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { I } from '../ui/icons'
import { Button, IconBtn, Field, Input, Select } from '../ui/primitives'
import { useConnections } from '../store/connections'
import type { Host } from '../data'

interface Props {
  host: Host
  onClose: () => void
}

export const EditConnectionModal = ({ host, onClose }: Props) => {
  const { groups: storeGroups, load } = useConnections()
  const [dbGroups, setDbGroups] = useState<string[]>([])

  // Load all groups fresh from DB when modal opens
  useEffect(() => {
    invoke<string[]>('get_groups').then(setDbGroups).catch(console.error)
  }, [])

  // Merge DB groups + store groups (deduped), always include current host group
  const groups = [...new Set([...dbGroups, ...storeGroups, host.group].filter(Boolean))]

  const [name, setName] = useState(host.name)
  const [hostAddr, setHostAddr] = useState(host.host)
  const [port, setPort] = useState(host.port)
  const [user, setUser] = useState(host.user)
  const [group, setGroup] = useState(host.group)
  const [authType, setAuthType] = useState<string>(host.auth_type ?? 'agent')
  const [keyPath, setKeyPath] = useState(host.private_key_path ?? '')
  const [password, setPassword] = useState(host.password ?? '')
  const [saving, setSaving] = useState(false)
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroup, setNewGroup] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await invoke('save_connection', {
        conn: {
          id: host.id,
          name: name || `${user}@${hostAddr}`,
          host: hostAddr,
          port,
          username: user,
          auth_type: authType,
          password: authType === 'password' ? password : null,
          private_key_path: authType === 'key' ? keyPath : null,
          group,
        },
      })
      await load()
      onClose()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>Edit connection</div>
          <span style={{ flex: 1 }} />
          <IconBtn icon={<I.X size={12} />} onClick={onClose} />
        </div>

        <form onSubmit={save} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder={`${user}@${hostAddr}`} />
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
            <Field label="Host">
              <Input value={hostAddr} onChange={e => setHostAddr(e.target.value)} mono required />
            </Field>
            <Field label="Port">
              <Input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 22)} mono />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Username">
              <Input value={user} onChange={e => setUser(e.target.value)} mono required />
            </Field>
            <Field label="Group">
              {addingGroup ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Input autoFocus value={newGroup} onChange={e => setNewGroup(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newGroup.trim()) { setGroup(newGroup.trim()); setAddingGroup(false); setNewGroup('') }
                      else if (e.key === 'Escape') { setAddingGroup(false); setNewGroup('') }
                    }}
                    placeholder="New group name" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setAddingGroup(false); setNewGroup('') }}>
                    <I.X size={12} />
                  </Button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Select value={group} onChange={e => setGroup(e.target.value)} style={{ flex: 1 }}>
                    {groups.map(g => <option key={g}>{g}</option>)}
                    {!groups.includes(group) && <option>{group}</option>}
                  </Select>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setAddingGroup(true)}>
                    <I.Plus size={12} />
                  </Button>
                </div>
              )}
            </Field>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 6 }}>Authentication</div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, padding: 2, background: 'var(--bg-2)', width: 'fit-content' }}>
              {[['agent', 'Auto (~/.ssh)'], ['key', 'Choose key'], ['password', 'Password']].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAuthType(k)} style={{ padding: '5px 12px', height: 26, border: 'none', borderRadius: 4, background: authType === k ? 'var(--bg-0)' : 'transparent', color: authType === k ? 'var(--text-1)' : 'var(--text-3)', fontSize: 12, fontWeight: 500, cursor: 'pointer', boxShadow: authType === k ? 'var(--shadow-sm)' : 'none' }}>{l}</button>
              ))}
            </div>
          </div>

          {authType === 'key' && (
            <Field label="Private key path">
              <Input value={keyPath} onChange={e => setKeyPath(e.target.value)} mono placeholder="~/.ssh/id_ed25519" />
            </Field>
          )}
          {authType === 'password' && (
            <Field label="Password">
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
