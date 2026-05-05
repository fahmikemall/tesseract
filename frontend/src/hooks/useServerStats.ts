import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Host } from '../data'

export interface ServerStats {
  cpu: number | null        // percent 0-100
  memUsedGb: number | null
  memTotalGb: number | null
  uptime: string | null     // "22d", "5h", "30m"
  users: number | null
  diskPct: number | null    // percent 0-100
  netRxKbps: number | null
  netTxKbps: number | null
  available: boolean
}

const EMPTY: ServerStats = {
  cpu: null, memUsedGb: null, memTotalGb: null,
  uptime: null, users: null, diskPct: null,
  netRxKbps: null, netTxKbps: null,
  available: false,
}

// Shell command: output is KEY:value lines
const STATS_CMD = [
  // CPU % (since boot – good approximation)
  `awk 'NR==1{u=$2+$3+$4;t=u+$5+$6+$7+$8;printf "CPU:%d\\n",int(u*100/(t>0?t:1))}' /proc/stat`,
  // Memory GB used / total
  `awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{printf "MEM:%.2f/%.2f\\n",(t-a)/1048576,t/1048576}' /proc/meminfo`,
  // Uptime formatted
  `awk '{d=int($1/86400);h=int($1%86400/3600);m=int($1%3600/60);if(d>0)printf "UP:%dd\\n",d;else if(h>0)printf "UP:%dh\\n",h;else printf "UP:%dm\\n",m}' /proc/uptime`,
  // Logged-in users
  `printf "USERS:%s\\n" "$(who 2>/dev/null | wc -l | tr -d ' ')"`,
  // Root disk %
  `df / 2>/dev/null | awk 'NR==2{gsub(/%/,"",$5);printf "DISK:%s\\n",$5}'`,
  // Network rx/tx bytes (first non-loopback interface)
  `awk 'NR>2&&!/lo:/{gsub(/:/,"",$1);printf "NET:%s %s %s\\n",$1,$2,$10;exit}' /proc/net/dev`,
].join('; ')

function parse(raw: string): Omit<ServerStats, 'available' | 'netRxKbps' | 'netTxKbps'> & { netRx?: number; netTx?: number } {
  const out: ReturnType<typeof parse> = {
    cpu: null, memUsedGb: null, memTotalGb: null,
    uptime: null, users: null, diskPct: null,
  }
  for (const line of raw.split('\n')) {
    const [key, val] = line.split(':')
    if (!key || !val) continue
    switch (key.trim()) {
      case 'CPU': out.cpu = parseInt(val) || 0; break
      case 'MEM': { const [u, t] = val.split('/'); out.memUsedGb = parseFloat(u); out.memTotalGb = parseFloat(t); break }
      case 'UP': out.uptime = val.trim(); break
      case 'USERS': out.users = parseInt(val) || 0; break
      case 'DISK': out.diskPct = parseInt(val) || 0; break
      case 'NET': { const [, rx, tx] = val.trim().split(' '); out.netRx = parseInt(rx) || 0; out.netTx = parseInt(tx) || 0; break }
    }
  }
  return out
}

export function useServerStats(host: Host, active: boolean): ServerStats {
  const [stats, setStats] = useState<ServerStats>(EMPTY)
  const prevNetRef = useRef<{ rx: number; tx: number; ts: number } | null>(null)

  useEffect(() => {
    if (!active) return
    // For password auth, stats require sshpass which isn't available on Windows.
    // Skip silently — the status bar will just show connection info.
    if (host.auth_type === 'password') return

    let cancelled = false

    const poll = async () => {
      try {
        const raw = await invoke<string>('ssh_exec', {
          host: host.host,
          port: host.port,
          username: host.user,
          authType: host.auth_type ?? 'agent',
          privateKeyPath: host.private_key_path ?? null,
          command: STATS_CMD,
        })
        if (cancelled) return

        const parsed = parse(raw)
        const now = Date.now()
        let netRxKbps: number | null = null
        let netTxKbps: number | null = null

        if (parsed.netRx !== undefined && parsed.netTx !== undefined) {
          const prev = prevNetRef.current
          if (prev) {
            const dt = (now - prev.ts) / 1000
            netRxKbps = Math.round((parsed.netRx - prev.rx) / 1024 / dt)
            netTxKbps = Math.round((parsed.netTx - prev.tx) / 1024 / dt)
          }
          prevNetRef.current = { rx: parsed.netRx, tx: parsed.netTx, ts: now }
        }

        setStats({ ...parsed, netRxKbps, netTxKbps, available: true })
      } catch (err) {
        // "skip" = password auth, timeout = server slow — silently show nothing
        if (!cancelled) setStats(EMPTY)
      }
    }

    poll()
    const id = setInterval(poll, 15_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [host.host, host.port, host.user, host.auth_type, host.private_key_path, active])

  return stats
}
