import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { X } from 'lucide-react'
import { useAppStore } from '../../store'
import type { SshConnection, AuthType } from '../../types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select } from '../ui/select'
import { v4 as uuidv4 } from 'uuid'

export function ConnectionForm() {
  const { connectionFormOpen, editingConnection, closeConnectionForm, setConnections } = useAppStore()

  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [authType, setAuthType] = useState<AuthType>('password')
  const [password, setPassword] = useState('')
  const [keyPath, setKeyPath] = useState('')
  const [group, setGroup] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editingConnection) {
      setName(editingConnection.name)
      setHost(editingConnection.host)
      setPort(String(editingConnection.port))
      setUsername(editingConnection.username)
      setAuthType(editingConnection.auth_type)
      setPassword(editingConnection.password ?? '')
      setKeyPath(editingConnection.private_key_path ?? '')
      setGroup(editingConnection.group ?? '')
    } else {
      setName('')
      setHost('')
      setPort('22')
      setUsername('')
      setAuthType('password')
      setPassword('')
      setKeyPath('')
      setGroup('')
    }
  }, [editingConnection, connectionFormOpen])

  if (!connectionFormOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const conn: SshConnection = {
        id: editingConnection?.id ?? uuidv4(),
        name,
        host,
        port: parseInt(port, 10),
        username,
        auth_type: authType,
        password: authType === 'password' ? password : undefined,
        private_key_path: authType === 'key' ? keyPath : undefined,
        group: group || undefined,
      }
      await invoke('save_connection', { conn })
      const conns = await invoke<SshConnection[]>('get_connections')
      setConnections(conns)
      closeConnectionForm()
    } catch (err) {
      console.error('Save connection error:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[420px] rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--border))]">
          <h2 className="text-sm font-semibold">
            {editingConnection ? 'Edit Connection' : 'New Connection'}
          </h2>
          <Button variant="ghost" size="icon" onClick={closeConnectionForm}>
            <X size={14} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Server"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="host">Host</Label>
              <Input
                id="host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.1"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                min={1}
                max={65535}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="root"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="group">Group</Label>
              <Input
                id="group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                placeholder="Production"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="auth_type">Auth Method</Label>
              <Select
                id="auth_type"
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType)}
              >
                <option value="password">Password</option>
                <option value="key">Private Key</option>
              </Select>
            </div>

            {authType === 'password' ? (
              <div className="col-span-2 space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            ) : (
              <div className="col-span-2 space-y-1">
                <Label htmlFor="key_path">Private Key Path</Label>
                <Input
                  id="key_path"
                  value={keyPath}
                  onChange={(e) => setKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_rsa"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={closeConnectionForm}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
