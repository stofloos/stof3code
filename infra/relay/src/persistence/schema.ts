import type {
  RelayAgentActivityState,
} from "@t3tools/contracts/relay";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Relay-as-IdP: the self-hosted relay owns its own user identities.
export const relayUsers = sqliteTable(
  "relay_users",
  {
    userId: text("user_id").primaryKey(),
    email: text("email").notNull(),
    // Bun.password hash (argon2id by default).
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_relay_users_email").on(table.email)],
);

export const relayEnvironmentLinks = sqliteTable(
  "relay_environment_links",
  {
    userId: text("user_id").notNull(),
    environmentId: text("environment_id").notNull(),
    environmentLabel: text("environment_label").notNull().default("Stofloos Environment"),
    environmentPublicKey: text("environment_public_key").notNull(),
    endpointHttpBaseUrl: text("endpoint_http_base_url").notNull(),
    endpointWsBaseUrl: text("endpoint_ws_base_url").notNull(),
    endpointProviderKind: text("endpoint_provider_kind").notNull(),
    notificationsEnabled: integer("notifications_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    liveActivitiesEnabled: integer("live_activities_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    managedTunnelsEnabled: integer("managed_tunnels_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    createdByDeviceId: text("created_by_device_id"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.environmentId] }),
    index("idx_relay_environment_links_environment").on(table.environmentId, table.revokedAt),
  ],
);

export const relayManagedEndpointAllocations = sqliteTable(
  "relay_managed_endpoint_allocations",
  {
    userId: text("user_id").notNull(),
    environmentId: text("environment_id").notNull(),
    hostname: text("hostname").notNull(),
    tunnelId: text("tunnel_id"),
    tunnelName: text("tunnel_name").notNull(),
    dnsRecordId: text("dns_record_id"),
    readyAt: text("ready_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.environmentId] }),
    uniqueIndex("idx_relay_managed_endpoint_allocations_hostname").on(table.hostname),
    uniqueIndex("idx_relay_managed_endpoint_allocations_tunnel_name").on(table.tunnelName),
  ],
);

export const relayEnvironmentCredentials = sqliteTable(
  "relay_environment_credentials",
  {
    credentialId: text("credential_id").primaryKey(),
    environmentId: text("environment_id").notNull(),
    environmentPublicKey: text("environment_public_key").notNull(),
    credentialHash: text("credential_hash").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_relay_environment_credentials_hash").on(table.credentialHash),
    index("idx_relay_environment_credentials_environment").on(table.environmentId, table.revokedAt),
    index("idx_relay_environment_credentials_environment_key").on(
      table.environmentId,
      table.environmentPublicKey,
      table.revokedAt,
    ),
  ],
);

export const relayAgentActivityRows = sqliteTable(
  "relay_agent_activity_rows",
  {
    environmentId: text("environment_id").notNull(),
    environmentPublicKey: text("environment_public_key").notNull(),
    threadId: text("thread_id").notNull(),
    stateJson: text("state_json", { mode: "json" }).notNull().$type<RelayAgentActivityState>(),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.environmentId, table.environmentPublicKey, table.threadId] }),
    index("idx_relay_agent_activity_rows_updated").on(table.updatedAt),
  ],
);

export const relayDpopProofs = sqliteTable(
  "relay_dpop_proofs",
  {
    thumbprint: text("thumbprint").notNull(),
    jti: text("jti").notNull(),
    iat: integer("iat").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.thumbprint, table.jti] }),
    index("idx_relay_dpop_proofs_expires_at").on(table.expiresAt),
  ],
);
