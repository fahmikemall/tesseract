import { X, Terminal as TerminalIcon } from 'lucide-react'
import { useAppStore } from '../../store'
import { TerminalTab } from './TerminalTab'
import { invoke } from '@tauri-apps/api/core'
import { cn } from '../../lib/utils'

export function TerminalArea() {
  const { sessions, activeSessionId, setActiveSession, removeSession } = useAppStore()

  const handleClose = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await invoke('ssh_disconnect', { sessionId }).catch(console.error)
    removeSession(sessionId)
  }

  if (sessions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))]">
        <TerminalIcon size={48} className="mb-4 opacity-20" />
        <p className="text-sm font-medium">No active sessions</p>
        <p className="text-xs mt-1 opacity-60">Select a connection from the sidebar to start</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <div className="flex items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] overflow-x-auto flex-shrink-0">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-xs border-r border-[hsl(var(--border))] whitespace-nowrap transition-colors min-w-0 group',
              session.id === activeSessionId
                ? 'bg-[hsl(var(--background))] text-[hsl(var(--foreground))]'
                : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent)/0.5)]'
            )}
          >
            <div
              className={cn(
                'w-2 h-2 rounded-full flex-shrink-0',
                session.status === 'connected' && 'bg-green-500',
                session.status === 'connecting' && 'bg-yellow-500 animate-pulse',
                session.status === 'disconnected' && 'bg-gray-500',
                session.status === 'error' && 'bg-red-500'
              )}
            />
            <span className="truncate max-w-32">{session.connection.name}</span>
            <button
              onClick={(e) => handleClose(session.id, e)}
              className="opacity-0 group-hover:opacity-100 hover:text-[hsl(var(--destructive))] transition-opacity ml-1"
            >
              <X size={11} />
            </button>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 p-1 bg-[hsl(var(--background))]">
        {sessions.map((session) => (
          <TerminalTab
            key={session.id}
            session={session}
            active={session.id === activeSessionId}
          />
        ))}
      </div>
    </div>
  )
}
