import { create } from 'zustand'
import type { SshConnection, Session } from '../types'

interface AppState {
  connections: SshConnection[]
  sessions: Session[]
  activeSessionId: string | null
  sidebarOpen: boolean
  connectionFormOpen: boolean
  editingConnection: SshConnection | null

  setConnections: (conns: SshConnection[]) => void
  addSession: (session: Session) => void
  updateSession: (id: string, patch: Partial<Session>) => void
  removeSession: (id: string) => void
  setActiveSession: (id: string | null) => void
  setSidebarOpen: (open: boolean) => void
  openConnectionForm: (conn?: SshConnection) => void
  closeConnectionForm: () => void
}

export const useAppStore = create<AppState>((set) => ({
  connections: [],
  sessions: [],
  activeSessionId: null,
  sidebarOpen: true,
  connectionFormOpen: false,
  editingConnection: null,

  setConnections: (connections) => set({ connections }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
      activeSessionId: session.id,
    })),

  updateSession: (id, patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })),

  removeSession: (id) =>
    set((state) => {
      const sessions = state.sessions.filter((s) => s.id !== id)
      const activeSessionId =
        state.activeSessionId === id ? (sessions[sessions.length - 1]?.id ?? null) : state.activeSessionId
      return { sessions, activeSessionId }
    }),

  setActiveSession: (id) => set({ activeSessionId: id }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  openConnectionForm: (conn) =>
    set({ connectionFormOpen: true, editingConnection: conn ?? null }),

  closeConnectionForm: () =>
    set({ connectionFormOpen: false, editingConnection: null }),
}))
