import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { I } from '../ui/icons'
import { IconBtn } from '../ui/primitives'
import type { Host } from '../data'

interface FileEntry {
  name: string
  is_dir: boolean
  size: number | null
  modified: string | null
  permissions: string | null
}

interface ConnectInfo {
  host: string; port: number; username: string
  authType: string; password: string | null; privateKeyPath: string | null
}

function fmtSize(n: number | null): string {
  if (n === null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

interface PaneSide {
  type: 'local' | 'remote'
  path: string
  entries: FileEntry[]
  loading: boolean
  error: string | null
  selected: Set<string>
}

export const SftpView = ({ host, onClose }: { host: Host; onClose: () => void }) => {
  // Use ref so loadRemote always has latest host credentials without stale closure issues
  const infoRef = useRef<ConnectInfo>({
    host: host.host, port: host.port, username: host.user,
    authType: host.auth_type ?? 'agent',
    password: host.password ?? null,
    privateKeyPath: host.private_key_path ?? null,
  })
  infoRef.current = {
    host: host.host, port: host.port, username: host.user,
    authType: host.auth_type ?? 'agent',
    password: host.password ?? null,
    privateKeyPath: host.private_key_path ?? null,
  }

  const [local, setLocal] = useState<PaneSide>({ type: 'local', path: '~', entries: [], loading: true, error: null, selected: new Set() })
  const [remote, setRemote] = useState<PaneSide>({ type: 'remote', path: `/home/${host.user}`, entries: [], loading: true, error: null, selected: new Set() })
  const [transfer, setTransfer] = useState<{ name: string; progress: string; done: boolean } | null>(null)

  const loadLocal = useCallback(async (path: string) => {
    setLocal(p => ({ ...p, loading: true, error: null, selected: new Set() }))
    try {
      const entries = await invoke<FileEntry[]>('sftp_list_local', { path })
      setLocal(p => ({ ...p, path, entries, loading: false }))
    } catch (e) {
      setLocal(p => ({ ...p, loading: false, error: String(e) }))
    }
  }, [])

  const loadRemote = useCallback(async (path: string) => {
    const info = infoRef.current  // always use latest credentials
    setRemote(p => ({ ...p, loading: true, error: null, selected: new Set() }))
    try {
      const entries = await invoke<FileEntry[]>('sftp_list_remote', {
        info: {
          host: info.host, port: info.port, username: info.username,
          auth_type: info.authType, password: info.password,
          private_key_path: info.privateKeyPath,
        },
        path,
      })
      setRemote(p => ({ ...p, path, entries, loading: false, selected: new Set() }))
    } catch (e) {
      setRemote(p => ({ ...p, loading: false, error: `${e}` }))
    }
  }, [])

  useEffect(() => {
    invoke<string>('sftp_local_home').then(home => loadLocal(home)).catch(() => loadLocal('~'))
    setTimeout(() => loadRemote(`/home/${host.user}`), 300)
  }, [])

  const navigateLocal = (entry: FileEntry) => {
    if (!entry.is_dir) return
    const next = entry.name === '..' ? local.path.replace(/\/[^/]+$/, '') || '/' : `${local.path.replace(/\/$/, '')}/${entry.name}`
    loadLocal(next)
  }

  const navigateRemote = (entry: FileEntry) => {
    if (!entry.is_dir) return
    let next: string
    if (entry.name === '..') {
      const parts = remote.path.split('/').filter(Boolean)
      parts.pop()
      next = '/' + parts.join('/')
      if (!next) next = '/'
    } else {
      next = `${remote.path.replace(/\/$/, '')}/${entry.name}`
    }
    loadRemote(next)
  }

  const connInfo = {
    host: infoRef.current.host, port: infoRef.current.port, username: infoRef.current.username,
    auth_type: infoRef.current.authType, password: infoRef.current.password,
    private_key_path: infoRef.current.privateKeyPath,
  }

  const sep = local.path.includes('\\') ? '\\' : '/'

  const transferFiles = async (files: string[], direction: 'upload' | 'download') => {
    const fileList = files.filter(name => {
      const entries = direction === 'upload' ? local.entries : remote.entries
      const entry = entries.find(e => e.name === name)
      return entry && !entry.is_dir
    })
    if (fileList.length === 0) { alert('Select at least one file (not a folder)'); return }

    for (let i = 0; i < fileList.length; i++) {
      const name = fileList[i]
      const label = fileList.length > 1 ? `${name} (${i + 1}/${fileList.length})` : name
      setTransfer({ name: label, progress: direction === 'upload' ? 'Uploading…' : 'Downloading…', done: false })
      try {
        if (direction === 'upload') {
          await invoke('sftp_upload', {
            info: connInfo,
            localPath: `${local.path.replace(/[/\\]$/, '')}${sep}${name}`,
            remotePath: `${remote.path.replace(/\/$/, '')}/${name}`,
          })
        } else {
          await invoke('sftp_download', {
            info: connInfo,
            remotePath: `${remote.path.replace(/\/$/, '')}/${name}`,
            localPath: `${local.path.replace(/[/\\]$/, '')}${sep}${name}`,
          })
        }
      } catch (e) {
        console.error(`${direction} error for ${name}:`, e)
        setTransfer({ name: label, progress: `Error: ${e}`, done: true })
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    const doneLabel = fileList.length > 1 ? `${fileList.length} files` : fileList[0]
    setTransfer({ name: doneLabel, progress: direction === 'upload' ? 'Upload complete' : 'Download complete', done: true })
    if (direction === 'upload') loadRemote(remote.path)
    else loadLocal(local.path)
    setTimeout(() => setTransfer(null), 2500)
  }

  const handleUpload = () => {
    const files = [...local.selected]
    if (files.length === 0) { alert('Select local files first (click to select, Ctrl+click for multiple)'); return }
    transferFiles(files, 'upload')
  }

  const handleDownload = () => {
    const files = [...remote.selected]
    if (files.length === 0) { alert('Select remote files first (click to select, Ctrl+click for multiple)'); return }
    transferFiles(files, 'download')
  }

  return (
    <div style={{ flex: '0 0 380px', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)', minWidth: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 10px', borderBottom: '1px solid var(--border)', flex: '0 0 34px' }}>
        <I.Folder size={13} />
        <span style={{ fontSize: 12, fontWeight: 500 }}>SFTP</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>· {host.host}</span>
        <span style={{ flex: 1 }} />
        <IconBtn icon={<I.Upload size={12} />}
          title={local.selected.size > 0 ? `Upload ${local.selected.size} file(s)` : 'Select local files first'}
          size={22} onClick={handleUpload} />
        <IconBtn icon={<I.Download size={12} />}
          title={remote.selected.size > 0 ? `Download ${remote.selected.size} file(s)` : 'Select remote files first'}
          size={22} onClick={handleDownload} />
        <IconBtn icon={<I.X size={12} />} title="Close" onClick={onClose} size={22} />
      </div>

      {/* Local pane — drop zone for remote→local downloads */}
      <FilePane
        title="Local" path={local.path}
        entries={local.entries} loading={local.loading} error={local.error}
        selected={local.selected}
        onSelect={(name, ctrl) => setLocal(p => {
          const next = new Set(ctrl ? p.selected : [])
          if (next.has(name)) next.delete(name); else next.add(name)
          return { ...p, selected: next }
        })}
        onNavigate={navigateLocal}
        onRefresh={() => loadLocal(local.path)}
        dragSource="local"
        localPath={local.path}
        remotePath={remote.path}
        onDropFromRemote={files => transferFiles(Array.isArray(files) ? files : [files], 'download')}
      />

      <div style={{ height: 1, background: 'var(--border)', flex: '0 0 1px' }} />

      {/* Remote pane — drop zone for local→remote uploads */}
      <FilePane
        title="Remote" path={remote.path}
        entries={remote.entries} loading={remote.loading} error={remote.error}
        selected={remote.selected}
        onSelect={(name, ctrl) => setRemote(p => {
          const next = new Set(ctrl ? p.selected : [])
          if (next.has(name)) next.delete(name); else next.add(name)
          return { ...p, selected: next }
        })}
        onNavigate={navigateRemote}
        onRefresh={() => loadRemote(remote.path)}
        dragSource="remote"
        localPath={local.path}
        remotePath={remote.path}
        onDropFromLocal={files => transferFiles(Array.isArray(files) ? files : [files], 'upload')}
      />

      {/* Status bar */}
      <div style={{ padding: '5px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: '0 0 28px' }}>
        {transfer ? (
          <>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {transfer.progress.includes('Error') ? '✗' : transfer.done ? '✓' : '⟳'} {transfer.name}
            </span>
            <span style={{ color: transfer.progress.includes('Error') ? '#ff7b72' : transfer.done ? '#3fb950' : 'var(--text-2)', flexShrink: 0, marginLeft: 8 }}>
              {transfer.progress.includes('Error') ? 'failed' : transfer.done ? 'done' : '…'}
            </span>
          </>
        ) : (
          <>
            <span>{local.selected.size > 0 ? `↑ ${local.selected.size} file(s) selected` : remote.selected.size > 0 ? `↓ ${remote.selected.size} file(s) selected` : 'Click to select · Ctrl+click for multi'}</span>
            <span>ready</span>
          </>
        )}
      </div>
    </div>
  )
}

const DRAG_KEY = 'tesseract-sftp-file'

function FilePane({ title, path, entries, loading, error, selected, onSelect, onNavigate, onRefresh, dragSource, onDropFromLocal, onDropFromRemote }: {
  title: string; path: string; entries: FileEntry[]; loading: boolean; error: string | null
  selected: Set<string>; onSelect: (n: string, ctrl: boolean) => void
  onNavigate: (e: FileEntry) => void; onRefresh: () => void
  dragSource: 'local' | 'remote'
  localPath?: string; remotePath?: string
  onDropFromLocal?: (filenames: string[]) => void
  onDropFromRemote?: (filenames: string[]) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, transition: 'background 120ms',
        background: isDragOver ? 'color-mix(in oklch, var(--bg-0) 80%, #58a6ff 20%)' : undefined,
        outline: isDragOver ? '2px dashed #58a6ff' : undefined, outlineOffset: '-2px',
      }}
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setIsDragOver(false)
        const data = e.dataTransfer.getData(DRAG_KEY)
        if (!data) return
        const { source, filenames } = JSON.parse(data)
        if (source === 'local' && onDropFromLocal) onDropFromLocal(filenames)
        if (source === 'remote' && onDropFromRemote) onDropFromRemote(filenames)
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg-1)', flex: '0 0 auto' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-4)', textTransform: 'uppercase', flexShrink: 0 }}>{title}</span>
        <div style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</div>
        <IconBtn size={20} icon={<I.Refresh size={11} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />} title="Refresh" onClick={onRefresh} />
      </div>

      <div className="sftp-scroll" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-0)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '16px 1fr 64px 90px 80px', gap: 8, padding: '4px 10px', fontSize: 10, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-1)' }}>
          <span /><span>Name</span><span>Size</span><span>Perms</span><span>Modified</span>
        </div>

        {loading && entries.length === 0 && (
          <div style={{ padding: '12px', fontSize: 11.5, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>Loading…</div>
        )}

        {!loading && error && (
          <div style={{ padding: '10px 12px', fontSize: 11.5, color: '#ff7b72', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: '12px', fontSize: 11.5, color: 'var(--text-4)' }}>Empty directory</div>
        )}

        {entries.map((f) => {
          const isSelected = selected.has(f.name)
          const draggable = f.name !== '..' && !f.is_dir
          return (
            <div key={f.name}
              draggable={draggable}
              title={f.permissions ?? undefined}
              onDragStart={e => {
                if (!draggable) return
                // Drag all selected files if this file is selected, else just this one
                const filenames = isSelected ? [...selected].filter(n => n !== '..') : [f.name]
                e.dataTransfer.setData(DRAG_KEY, JSON.stringify({ source: dragSource, filenames }))
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={e => f.name !== '..' && onSelect(f.name, e.ctrlKey || e.metaKey)}
              onDoubleClick={() => f.is_dir && onNavigate(f)}
              style={{
                display: 'grid', gridTemplateColumns: '16px 1fr 64px 90px 80px',
                gap: 8, padding: '4px 10px', alignItems: 'center',
                cursor: draggable ? 'grab' : 'pointer',
                background: isSelected ? 'var(--bg-active)' : 'transparent',
                borderBottom: '1px solid var(--bg-2)',
                userSelect: 'none',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              <span style={{ color: f.is_dir ? '#58a6ff' : 'var(--text-3)', display: 'inline-flex' }}>
                {f.is_dir ? <I.Folder size={12} /> : <I.File size={12} />}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: f.is_dir ? 'var(--font-ui)' : 'var(--font-mono)' }}>
                {f.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{fmtSize(f.size)}</span>
              <span style={{ fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{f.permissions ?? ''}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.modified ?? ''}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
