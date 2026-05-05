export type AuthType = 'password' | 'key'

export interface SshConnection {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_type: AuthType
  password?: string
  private_key_path?: string
  group?: string
}

export interface Session {
  id: string
  connectionId: string
  connection: SshConnection
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
}
