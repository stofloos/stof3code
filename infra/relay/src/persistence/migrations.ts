/**
 * SQLite schema for the self-hosted Stofloos relay.
 *
 * Applied idempotently at startup (see `db.ts`). Keep these statements in sync
 * with `schema.ts`. Booleans are stored as INTEGER (0/1); JSON columns as TEXT.
 */
export const RELAY_MIGRATIONS: ReadonlyArray<string> = [
  `CREATE TABLE IF NOT EXISTS relay_users (
    user_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_users_email ON relay_users (email);`,

  `CREATE TABLE IF NOT EXISTS relay_environment_links (
    user_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    environment_label TEXT NOT NULL DEFAULT 'Stofloos Environment',
    environment_public_key TEXT NOT NULL,
    endpoint_http_base_url TEXT NOT NULL,
    endpoint_ws_base_url TEXT NOT NULL,
    endpoint_provider_kind TEXT NOT NULL,
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    live_activities_enabled INTEGER NOT NULL DEFAULT 1,
    managed_tunnels_enabled INTEGER NOT NULL DEFAULT 0,
    created_by_device_id TEXT,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, environment_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_relay_environment_links_environment
    ON relay_environment_links (environment_id, revoked_at);`,

  `CREATE TABLE IF NOT EXISTS relay_managed_endpoint_allocations (
    user_id TEXT NOT NULL,
    environment_id TEXT NOT NULL,
    hostname TEXT NOT NULL,
    tunnel_id TEXT,
    tunnel_name TEXT NOT NULL,
    dns_record_id TEXT,
    ready_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, environment_id)
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_managed_endpoint_allocations_hostname
    ON relay_managed_endpoint_allocations (hostname);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_managed_endpoint_allocations_tunnel_name
    ON relay_managed_endpoint_allocations (tunnel_name);`,

  `CREATE TABLE IF NOT EXISTS relay_environment_credentials (
    credential_id TEXT PRIMARY KEY,
    environment_id TEXT NOT NULL,
    environment_public_key TEXT NOT NULL,
    credential_hash TEXT NOT NULL,
    revoked_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_relay_environment_credentials_hash
    ON relay_environment_credentials (credential_hash);`,
  `CREATE INDEX IF NOT EXISTS idx_relay_environment_credentials_environment
    ON relay_environment_credentials (environment_id, revoked_at);`,
  `CREATE INDEX IF NOT EXISTS idx_relay_environment_credentials_environment_key
    ON relay_environment_credentials (environment_id, environment_public_key, revoked_at);`,

  `CREATE TABLE IF NOT EXISTS relay_agent_activity_rows (
    environment_id TEXT NOT NULL,
    environment_public_key TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (environment_id, environment_public_key, thread_id)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_relay_agent_activity_rows_updated
    ON relay_agent_activity_rows (updated_at);`,

  `CREATE TABLE IF NOT EXISTS relay_dpop_proofs (
    thumbprint TEXT NOT NULL,
    jti TEXT NOT NULL,
    iat INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (thumbprint, jti)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_relay_dpop_proofs_expires_at
    ON relay_dpop_proofs (expires_at);`,
];
