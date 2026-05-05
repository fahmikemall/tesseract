import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Host } from '../data'
import { SNIPPETS as DEMO_SNIPPETS } from '../data'
import type { Snippet } from '../data'

interface RawConnection {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'key' | 'agent'
  password?: string
  private_key_path?: string
  group?: string
  os_type?: string
}

interface PingResult {
  host: string
  port: number
  online: boolean
  latency_ms?: number
}

// Convert SQLite connection → Host shape for UI
function toHost(c: RawConnection, status: 'online' | 'offline' | 'warn' = 'offline', latency: number | null = null): Host {
  return {
    id: c.id,
    name: c.name,
    host: c.host,
    port: c.port,
    user: c.username,
    group: c.group || 'Default',
    status,
    latency,
    tags: [],
    lastSeen: status === 'online' ? 'now' : 'unknown',
    fwd: 0,
    key: c.private_key_path?.split('/').pop() ?? c.private_key_path?.split('\\').pop() ?? 'id_ed25519',
    auth_type: c.auth_type,
    password: c.password,
    private_key_path: c.private_key_path,
    os_type: c.os_type,
  }
}

interface ConnectionsState {
  connections: Host[]
  groups: string[]             // groups from SQLite (persist even when empty)
  snippets: Snippet[]
  systemUser: string
  lastRefresh: Date | null
  refreshing: boolean
  activeSessionCount: number
  usingDemoData: boolean

  load: () => Promise<void>
  ping: (id: string) => Promise<void>
  pingAll: () => Promise<void>
  setActiveSessionCount: (n: number) => void
  refreshWithPing: () => Promise<void>
  createGroup: (name: string) => Promise<void>
  renameGroup: (oldName: string, newName: string) => Promise<void>
  deleteGroup: (name: string) => Promise<void>
}

export const useConnections = create<ConnectionsState>((set, get) => ({
  connections: [],
  groups: [],
  snippets: DEMO_SNIPPETS,
  systemUser: 'user',
  lastRefresh: null,
  refreshing: false,
  activeSessionCount: 0,
  usingDemoData: false,

  load: async () => {
    set({ refreshing: true })
    try {
      const [raw, user, groups] = await Promise.all([
        invoke<RawConnection[]>('get_connections'),
        invoke<string>('get_system_user').catch(() => 'user'),
        invoke<string[]>('get_groups').catch(() => [] as string[]),
      ])

      const hosts = raw.map(c => toHost(c))
      const connGroups = [...new Set(hosts.map(h => h.group))]
      const allGroups = [...new Set([...groups, ...connGroups])].filter(Boolean)
      set({ connections: hosts, groups: allGroups, systemUser: user, lastRefresh: new Date(), usingDemoData: false })
    } catch (err) {
      console.error('Failed to load connections:', err)
      set({ connections: [] })
    } finally {
      set({ refreshing: false })
    }
  },

  ping: async (id: string) => {
    const conn = get().connections.find(c => c.id === id)
    if (!conn) return
    try {
      const result = await invoke<PingResult>('ping_host', { host: conn.host, port: conn.port })
      set(state => ({
        connections: state.connections.map(c =>
          c.id === id
            ? { ...c, status: result.online ? 'online' : 'offline', latency: result.latency_ms ?? null, lastSeen: result.online ? 'now (TCP)' : c.lastSeen }
            : c
        ),
      }))
    } catch {
      set(state => ({
        connections: state.connections.map(c =>
          c.id === id ? { ...c, status: 'offline' } : c
        ),
      }))
    }
  },

  pingAll: async () => {
    const { connections, usingDemoData } = get()
    if (usingDemoData) return // Skip pinging demo hosts
    await Promise.all(connections.map(c => get().ping(c.id)))
  },

  refreshWithPing: async () => {
    await get().load()
    await get().pingAll()
  },

  setActiveSessionCount: (n: number) => set({ activeSessionCount: n }),

  createGroup: async (name: string) => {
    await invoke('upsert_group', { name })
    await get().load()
  },

  renameGroup: async (oldName: string, newName: string) => {
    await invoke('rename_group', { oldName, newName })
    await get().load()
  },

  deleteGroup: async (name: string) => {
    await invoke('delete_group', { name })
    await get().load()
  },
}))
