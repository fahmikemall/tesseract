import { Server, Plus, Trash2, ChevronRight } from 'lucide-react'
import { useAppStore } from '../../store'
import type { SshConnection } from '../../types'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'
import { invoke } from '@tauri-apps/api/core'
import { v4 as uuidv4 } from 'uuid'

export function Sidebar() {
  const {
    connections,
    sessions,
    activeSessionId,
    openConnectionForm,
    addSession,
    setActiveSession,
  } = useAppStore()

  const handleConnect = async (conn: SshConnection) => {
    const existing = sessions.find((s) => s.connectionId === conn.id && s.status === 'connected')
    if (existing) {
      setActiveSession(existing.id)
      return
    }

    const sessionId = uuidv4()
    addSession({ id: sessionId, connectionId: conn.id, connection: conn, status: 'connecting' })

    try {
      await invoke('ssh_connect', {
        request: {
          session_id: sessionId,
          host: conn.host,
          port: conn.port,
          username: conn.username,
          auth_type: conn.auth_type,
          password: conn.password,
          private_key_path: conn.private_key_path,
        },
      })
      useAppStore.getState().updateSession(sessionId, { status: 'connected' })
    } catch (err) {
      useAppStore.getState().updateSession(sessionId, { status: 'error' })
      console.error('SSH connect error:', err)
    }
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await invoke('delete_connection', { id })
    const conns = await invoke<SshConnection[]>('get_connections')
    useAppStore.getState().setConnections(conns)
  }

  const grouped = connections.reduce<Record<string, SshConnection[]>>((acc, conn) => {
    const group = conn.group || 'Default'
    if (!acc[group]) acc[group] = []
    acc[group].push(conn)
    return acc
  }, {})

  return (
    <aside className="w-60 flex-shrink-0 flex flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-[hsl(var(--border))]">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[hsl(var(--primary))] rounded flex items-center justify-center">
            <ChevronRight size={12} className="text-black" />
          </div>
          <span className="text-xs font-semibold text-[hsl(var(--foreground))] tracking-widest uppercase">
            Tesseract
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openConnectionForm()}
          title="New connection"
        >
          <Plus size={14} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {Object.entries(grouped).map(([group, conns]) => (
          <div key={group}>
            <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-[hsl(var(--muted-foreground))] font-semibold">
              {group}
            </div>
            {conns.map((conn) => {
              const session = sessions.find((s) => s.connectionId === conn.id)
              const isActive = session?.id === activeSessionId
              const isConnected = session?.status === 'connected'

              return (
                <button
                  key={conn.id}
                  onClick={() => handleConnect(conn)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors group',
                    isActive
                      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]'
                      : 'hover:bg-[hsl(var(--accent)/0.5)] text-[hsl(var(--muted-foreground))]'
                  )}
                >
                  <div className="relative flex-shrink-0">
                    <Server size={14} />
                    {isConnected && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium">{conn.name}</div>
                    <div className="truncate text-[10px] text-[hsl(var(--muted-foreground))]">
                      {conn.username}@{conn.host}:{conn.port}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6 flex-shrink-0"
                    onClick={(e) => handleDelete(conn.id, e)}
                    title="Delete"
                  >
                    <Trash2 size={11} className="text-[hsl(var(--destructive))]" />
                  </Button>
                </button>
              )
            })}
          </div>
        ))}

        {connections.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
            <Server size={24} className="mx-auto mb-2 opacity-30" />
            No connections yet.
            <br />
            Click + to add one.
          </div>
        )}
      </div>
    </aside>
  )
}
