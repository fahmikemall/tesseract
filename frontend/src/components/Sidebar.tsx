import { useMemo, useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { KeyRound, Settings2 } from 'lucide-react'
import { I } from '../ui/icons'
import { OsIcon } from '../ui/OsIcon'

const KeyIcon = () => <KeyRound size={14} strokeWidth={1.75} />
const SettingsIcon = () => <Settings2 size={14} strokeWidth={1.75} />
import { StatusDot, Button, IconBtn, SectionLabel, Kbd } from '../ui/primitives'
import { ContextMenu, type MenuItem } from '../ui/ContextMenu'
import { EditConnectionModal } from './EditConnectionModal'
import { HostKeyModal } from './HostKeyModal'
import { modKey } from '../lib/platform'
import { useConnections } from '../store/connections'

// ── + dropdown ────────────────────────────────────────────────────────────────
const PlusMenu = ({ onNewHost, onNewGroup }: { onNewHost: () => void; onNewGroup: (name: string) => void }) => {
  const [open, setOpen] = useState(false)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [groupName, setGroupName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fn = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(false); setCreatingGroup(false) } }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ background: 'transparent', border: 'none', color: open ? 'var(--text-1)' : 'var(--text-3)', cursor: 'pointer', padding: 2, display: 'inline-flex', borderRadius: 4 }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}>
        <I.Plus size={12} />
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, width: 180, background: 'var(--bg-1)', border: '1px solid var(--border-strong)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', padding: '4px 0', zIndex: 100 }}>
          {!creatingGroup ? (
            <>
              <button onClick={() => { onNewHost(); setOpen(false) }} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 12px', border: 'none', background: 'transparent', color: 'var(--text-1)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <I.Server size={13} style={{ color: 'var(--text-3)' }} /> New connection
              </button>
              <button onClick={() => setCreatingGroup(true)} style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 12px', border: 'none', background: 'transparent', color: 'var(--text-1)', fontSize: 12.5, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                <I.Folder size={13} style={{ color: 'var(--text-3)' }} /> New group
              </button>
            </>
          ) : (
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Group name</div>
              <input autoFocus value={groupName} onChange={e => setGroupName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && groupName.trim()) { onNewGroup(groupName.trim()); setOpen(false); setCreatingGroup(false); setGroupName('') }
                  else if (e.key === 'Escape') { setCreatingGroup(false); setGroupName('') }
                }}
                placeholder="e.g. Staging"
                style={{ width: '100%', padding: '6px 8px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 5, color: 'var(--text-1)', fontSize: 12, fontFamily: 'var(--font-ui)', outline: 'none' }} />
              <div style={{ fontSize: 10.5, color: 'var(--text-4)', marginTop: 6 }}>Enter to confirm · Esc to cancel</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  activeHostId: string | null
  connectedHostId?: string | null
  onSelect: (id: string) => void
  onNew: (defaultGroup?: string) => void
  route: string
  onRoute: (r: string) => void
  collapsedGroups: Set<string>
  setCollapsedGroups: (s: Set<string>) => void
}

export const Sidebar = ({ activeHostId, connectedHostId, onSelect, onNew, route, onRoute, collapsedGroups, setCollapsedGroups }: SidebarProps) => {
  const [q, setQ] = useState('')
  const [keyCount, setKeyCount] = useState<number | null>(null)
  const { connections, groups, systemUser, activeSessionCount, load, createGroup, renameGroup, deleteGroup } = useConnections()

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; hostId: string } | null>(null)
  const [editingHost, setEditingHost] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Group context menu
  const [groupCtx, setGroupCtx] = useState<{ x: number; y: number; name: string } | null>(null)
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null)
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const [hostKeyCheck, setHostKeyCheck] = useState<{ host: string; port: number; id: string } | null>(null)

  const handleHostConnect = async (id: string) => {
    const h = connections.find(c => c.id === id)
    if (!h) return
    // If this host already has an active SSH session, just navigate back to it
    if (id === connectedHostId) {
      onSelect(id)
      return
    }
    const known = await invoke<string | null>('check_known_host', { host: h.host, port: h.port }).catch(() => null)
    if (known !== null) {
      onSelect(id)
    } else {
      setHostKeyCheck({ host: h.host, port: h.port, id })
    }
  }

  useEffect(() => {
    invoke<{ name: string }[]>('get_ssh_keys')
      .then(keys => setKeyCount(keys.length))
      .catch(() => setKeyCount(0))
  }, [])

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return connections
    return connections.filter(h =>
      h.name.toLowerCase().includes(t) ||
      h.host.toLowerCase().includes(t) ||
      h.user.toLowerCase().includes(t) ||
      h.tags.some(tag => tag.toLowerCase().includes(t))
    )
  }, [q, connections])

  const grouped = useMemo(() => {
    const m: Record<string, typeof connections> = {}
    filtered.forEach(h => { (m[h.group] = m[h.group] || []).push(h) })
    return m
  }, [filtered, connections])

  const toggleGroup = (g: string) => {
    const next = new Set(collapsedGroups)
    next.has(g) ? next.delete(g) : next.add(g)
    setCollapsedGroups(next)
  }

  const navItem = (id: string, icon: React.ReactNode, label: string, badge?: number) => {
    const active = route === id
    return (
      <button onClick={() => onRoute(id)} style={{
        display: 'flex', alignItems: 'center', gap: 9, width: '100%',
        padding: '0 10px', height: 28,
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-2)',
        border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
        fontSize: 12.5, fontWeight: active ? 500 : 450,
      }}
        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
        <span style={{ display: 'inline-flex', color: active ? 'var(--text-1)' : 'var(--text-3)' }}>{icon}</span>
        <span style={{ flex: 1 }}>{label}</span>
        {badge != null && <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{badge}</span>}
      </button>
    )
  }

  return (
    <aside style={{
      width: 'clamp(200px, var(--tw-sidebar-w, 264px), 400px)', flex: '0 0 clamp(200px, var(--tw-sidebar-w, 264px), 400px)',
      borderRight: '1px solid var(--border)', background: 'var(--bg-1)',
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>

      {/* Search */}
      <div style={{ padding: '10px 12px 8px' }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-4)', display: 'inline-flex' }}>
            <I.Search />
          </span>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search hosts, tags…"
            style={{
              width: '100%', height: 'var(--tw-search-h, 34px)', padding: '0 36px 0 30px',
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--text-1)', fontSize: 13, outline: 'none',
            }} />
          <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
            <Kbd>{modKey}K</Kbd>
          </span>
        </div>
      </div>

      <SectionLabel right={<PlusMenu onNewHost={onNew} onNewGroup={async (name) => { await createGroup(name) }} />}>Hosts · {connections.length}</SectionLabel>

      {/* Host list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
        {/* Use groups from DB so empty groups persist */}
        {(q ? [...new Set(connections.map(h => h.group))] : groups).map(g => {
          const list = grouped[g] || []
          if (q && list.length === 0) return null
          const collapsed = collapsedGroups.has(g)
          const isEmpty = list.length === 0
          return (
            <div key={g} style={{ marginBottom: 4 }}>
              {renamingGroup === g ? (
                <div style={{ padding: '2px 4px' }}>
                  <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
                      else if (e.key === 'Escape') { setRenameValue(g); setRenamingGroup(null) }
                    }}
                    onBlur={async () => {
                      const trimmed = renameValue.trim()
                      if (trimmed && trimmed !== g) {
                        await renameGroup(g, trimmed)
                      }
                      setRenamingGroup(null)
                    }}
                    style={{ width: '100%', padding: '3px 6px', background: 'var(--bg-0)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-1)', fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 500, letterSpacing: '0.03em', outline: 'none' }} />
                </div>
              ) : (
                <button onClick={() => toggleGroup(g)}
                  onContextMenu={e => { e.preventDefault(); setGroupCtx({ x: e.clientX, y: e.clientY, name: g }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                    padding: '4px 4px', background: 'transparent', border: 'none',
                    color: isEmpty ? 'var(--text-4)' : 'var(--text-3)', cursor: 'pointer', fontSize: 11,
                    letterSpacing: '0.03em', fontWeight: 500,
                  }}>
                  <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 100ms' }}>
                    <I.ChevronDown size={10} />
                  </span>
                  <span>{g}</span>
                  {isEmpty && <span style={{ fontSize: 9, color: 'var(--text-4)', marginLeft: 4, textTransform: 'none', letterSpacing: 0 }}>empty</span>}
                </button>
              )}
              {!collapsed && list.map(h => {
                const active = h.id === activeHostId && route === 'host'
                const selected = h.id === selectedHostId
                return (
                  <button key={h.id}
                    onClick={() => setSelectedHostId(h.id)}
                    onDoubleClick={() => handleHostConnect(h.id)}
                    onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, hostId: h.id }) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                      paddingLeft: 16, paddingRight: 8, height: 28, marginBottom: 1,
                      background: active ? 'var(--bg-active)' : selected ? 'var(--bg-hover)' : 'transparent',
                      border: 'none', borderLeft: `2px solid ${active ? 'var(--text-1)' : 'transparent'}`,
                      color: 'var(--text-1)', borderRadius: 0, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { if (!active && !selected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { if (!active && !selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <OsIcon os={h.os_type} size={13} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: active ? 500 : 450, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {h.name}
                    </span>
                    {h.pinned && <span style={{ color: 'var(--text-4)' }}><I.Pin size={11} /></span>}
                    {h.fwd > 0 && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>↳{h.fwd}</span>}
                    {h.latency != null
                      ? <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-4)', minWidth: 28, textAlign: 'right' }}>{h.latency}ms</span>
                      : <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>—</span>
                    }
                  </button>
                )
              })}
            </div>
          )
        })}
        {!q && connections.length === 0 && groups.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-3)' }}>
            <I.Server size={24} style={{ opacity: 0.2, display: 'block', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 12, marginBottom: 4 }}>No connections yet</div>
            <button onClick={() => onNew()} style={{ fontSize: 11.5, color: 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Add your first server</button>
          </div>
        )}
        {q && filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
            No hosts match "{q}"
          </div>
        )}
      </div>

      {/* Bottom nav — Keys & Settings */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '4px 8px 4px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {navItem('keys', <KeyIcon />, 'Keys')}
        {navItem('settings', <SettingsIcon />, 'Settings')}
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (() => {
        const h = connections.find(c => c.id === ctxMenu.hostId)
        if (!h) return null
        const items: MenuItem[] = [
          { label: 'Connect', icon: <I.Terminal size={13} />, onClick: () => handleHostConnect(h.id) },
          { label: 'Edit connection', icon: <I.Edit size={13} />, onClick: () => setEditingHost(h.id) },
          { label: 'Rename', icon: <I.Edit size={13} />, onClick: () => setEditingHost(h.id) },
          { divider: true, label: '', onClick: () => {} },
          { label: 'Copy address', icon: <I.Copy size={13} />, onClick: () => navigator.clipboard.writeText(`${h.user}@${h.host}:${h.port}`) },
          { label: 'Copy SSH command', icon: <I.Copy size={13} />, onClick: () => navigator.clipboard.writeText(`ssh ${h.user}@${h.host}${h.port !== 22 ? ` -p ${h.port}` : ''}`) },
          { divider: true, label: '', onClick: () => {} },
          { label: 'Delete', icon: <I.Trash size={13} />, danger: true, onClick: () => setDeleteConfirm(h.id) },
        ]
        return <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={items} onClose={() => setCtxMenu(null)} />
      })()}

      {/* Edit modal */}
      {editingHost && (() => {
        const h = connections.find(c => c.id === editingHost)
        if (!h) return null
        return <EditConnectionModal host={h} onClose={() => setEditingHost(null)} />
      })()}

      {/* Delete confirm */}
      {deleteConfirm && (() => {
        const h = connections.find(c => c.id === deleteConfirm)
        if (!h) return null
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setDeleteConfirm(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: 360, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Delete "{h.name}"?</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.6 }}>
                This will remove the connection from your hosts list. The server itself is not affected.
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                <Button variant="outline" onClick={async () => {
                  await invoke('delete_connection', { id: h.id }).catch(console.error)
                  await load()
                  setDeleteConfirm(null)
                }} style={{ color: '#ff7b72', borderColor: 'rgba(255,123,114,0.4)' }}>Delete</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Group right-click context menu */}
      {groupCtx && (
        <ContextMenu
          x={groupCtx.x} y={groupCtx.y}
          onClose={() => setGroupCtx(null)}
          items={[
            {
              label: 'New connection here', icon: <I.Plus size={13} />,
              onClick: () => onNew(groupCtx.name),
            },
            { divider: true, label: '', onClick: () => {} },
            {
              label: 'Rename group', icon: <I.Edit size={13} />,
              onClick: () => { setRenamingGroup(groupCtx.name); setRenameValue(groupCtx.name) },
            },
            {
              label: 'Delete group', icon: <I.Trash size={13} />, danger: true,
              onClick: () => setDeletingGroup(groupCtx.name),
            },
          ]}
        />
      )}

      {/* Delete group confirm */}
      {deletingGroup && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'oklch(0 0 0 / 0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeletingGroup(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 380, background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Delete group "{deletingGroup}"?</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
              {(grouped[deletingGroup] || []).length > 0
                ? `${(grouped[deletingGroup] || []).length} connection(s) in this group will be moved to "Default".`
                : 'This empty group will be removed.'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="ghost" onClick={() => setDeletingGroup(null)}>Cancel</Button>
              <Button variant="outline" onClick={async () => {
                await deleteGroup(deletingGroup)
                setDeletingGroup(null)
              }} style={{ color: '#ff7b72', borderColor: 'rgba(255,123,114,0.4)' }}>Delete</Button>
            </div>
          </div>
        </div>
      )}
      {/* Host key verification modal */}
      {hostKeyCheck && (
        <HostKeyModal
          host={hostKeyCheck.host}
          port={hostKeyCheck.port}
          onAccept={() => { setHostKeyCheck(null); onSelect(hostKeyCheck.id) }}
          onCancel={() => setHostKeyCheck(null)}
        />
      )}
    </aside>
  )
}
