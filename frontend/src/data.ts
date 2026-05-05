export interface Host {
  id: string
  name: string
  host: string
  user: string
  port: number
  group: string
  status: 'online' | 'offline' | 'warn'
  latency: number | null
  tags: string[]
  lastSeen: string
  pinned?: boolean
  fwd: number
  key: string
  // Real connection fields (from SQLite / user-added hosts)
  auth_type?: 'password' | 'key' | 'agent'
  password?: string
  private_key_path?: string
  os_type?: string
}

export interface Key {
  name: string
  type: string
  fp: string
  added: string
  hosts: number
  comment: string
}

export interface Snippet {
  name: string
  cmd: string
  tag: string
}

export const HOSTS: Host[] = [
  { id: 'prd-api-1', name: 'api-prod-01', host: 'api-1.prod.tesseract.io', user: 'deploy', port: 22, group: 'Production', status: 'online', latency: 18, tags: ['nginx', 'node'], lastSeen: 'now', pinned: true, fwd: 2, key: 'id_ed25519_prod' },
  { id: 'prd-api-2', name: 'api-prod-02', host: 'api-2.prod.tesseract.io', user: 'deploy', port: 22, group: 'Production', status: 'online', latency: 22, tags: ['nginx', 'node'], lastSeen: 'now', fwd: 0, key: 'id_ed25519_prod' },
  { id: 'prd-db', name: 'db-primary', host: 'db-1.prod.tesseract.io', user: 'postgres', port: 22, group: 'Production', status: 'online', latency: 14, tags: ['postgres', '16'], lastSeen: 'now', fwd: 1, key: 'id_ed25519_prod' },
  { id: 'prd-cache', name: 'redis-cluster', host: 'redis.prod.tesseract.io', user: 'ops', port: 22, group: 'Production', status: 'warn', latency: 87, tags: ['redis'], lastSeen: '2m ago', fwd: 0, key: 'id_ed25519_prod' },
  { id: 'prd-worker', name: 'worker-pool', host: 'worker-1.prod.tesseract.io', user: 'deploy', port: 22, group: 'Production', status: 'online', latency: 21, tags: ['sidekiq'], lastSeen: 'now', fwd: 0, key: 'id_ed25519_prod' },
  { id: 'stg-api', name: 'staging-api', host: 'api.staging.tesseract.io', user: 'deploy', port: 22, group: 'Staging', status: 'online', latency: 31, tags: ['staging'], lastSeen: 'now', fwd: 0, key: 'id_ed25519_stg' },
  { id: 'stg-db', name: 'staging-db', host: 'db.staging.tesseract.io', user: 'postgres', port: 22, group: 'Staging', status: 'online', latency: 28, tags: ['postgres'], lastSeen: 'now', fwd: 0, key: 'id_ed25519_stg' },
  { id: 'homelab', name: 'homelab', host: '10.0.1.42', user: 'kemal', port: 22, group: 'Personal', status: 'online', latency: 3, tags: ['nas', 'lan'], lastSeen: 'now', fwd: 3, key: 'id_ed25519' },
  { id: 'vps', name: 'vps-frankfurt', host: 'fra.kemal.dev', user: 'root', port: 2222, group: 'Personal', status: 'online', latency: 42, tags: ['vps'], lastSeen: 'now', fwd: 0, key: 'id_ed25519' },
  { id: 'pi', name: 'raspberry-pi', host: 'pi.local', user: 'pi', port: 22, group: 'Personal', status: 'offline', latency: null, tags: ['arm'], lastSeen: '3h ago', fwd: 0, key: 'id_ed25519' },
  { id: 'dev-build', name: 'build-runner', host: 'build.dev.tesseract.io', user: 'ci', port: 22, group: 'Development', status: 'online', latency: 12, tags: ['ci'], lastSeen: 'now', fwd: 0, key: 'id_ed25519' },
  { id: 'dev-sandbox', name: 'sandbox', host: 'sandbox.dev.tesseract.io', user: 'kemal', port: 22, group: 'Development', status: 'offline', latency: null, tags: ['scratch'], lastSeen: 'yesterday', fwd: 0, key: 'id_ed25519' },
]

export const GROUPS = ['Production', 'Staging', 'Development', 'Personal']

export const KEYS: Key[] = [
  { name: 'id_ed25519', type: 'ED25519', fp: 'SHA256:zBx9k…7Qm3', added: 'Mar 12, 2024', hosts: 5, comment: 'kemal@workstation' },
  { name: 'id_ed25519_prod', type: 'ED25519', fp: 'SHA256:p4w8K…aH2n', added: 'Jan 04, 2024', hosts: 5, comment: 'deploy / prod' },
  { name: 'id_ed25519_stg', type: 'ED25519', fp: 'SHA256:9hQwR…Lm0v', added: 'Jan 04, 2024', hosts: 2, comment: 'deploy / staging' },
  { name: 'id_rsa_legacy', type: 'RSA-4096', fp: 'SHA256:Ts2vY…Bn1x', added: 'Aug 21, 2022', hosts: 0, comment: 'archived' },
]

export const SNIPPETS: Snippet[] = [
  { name: 'Tail nginx access log', cmd: 'tail -f /var/log/nginx/access.log', tag: 'logs' },
  { name: 'Disk usage by directory', cmd: 'du -sh /* 2>/dev/null | sort -h', tag: 'diag' },
  { name: 'Restart systemd service', cmd: 'sudo systemctl restart $1 && sudo systemctl status $1', tag: 'ops' },
  { name: 'Show listening ports', cmd: 'ss -tulpn | grep LISTEN', tag: 'net' },
  { name: 'Postgres top queries', cmd: "psql -c 'SELECT pid, now()-query_start AS dur, query FROM pg_stat_activity ORDER BY dur DESC LIMIT 10;'", tag: 'db' },
]
