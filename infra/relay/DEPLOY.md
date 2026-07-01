# Stofloos self-hosted relay — deploy guide

The relay is a plain Bun HTTP service backed by SQLite. No Cloudflare, PlanetScale,
Clerk, or Alchemy. The relay is its own identity provider (users live in SQLite).

> Status: Phase 1 in progress. Foundation, config, SQLite persistence, and the
> relay-as-IdP auth primitives are in place. Remaining before first boot: finish
> the repository conversions, the `Api.ts` auth swap, and `src/server.ts`
> (tracked in the implementation task list).

## 1. Generate key material

```sh
bun scripts/gen-keys.ts
```

Emits two EdDSA keypairs (single-line PEM):

- `RELAY_CLOUD_MINT_PRIVATE_KEY` / `RELAY_CLOUD_MINT_PUBLIC_KEY` — sign DPoP access
  tokens and environment link challenges.
- `RELAY_AUTH_SESSION_PRIVATE_KEY` / `RELAY_AUTH_SESSION_PUBLIC_KEY` — sign login
  session JWTs (the `subject_token` clients exchange for a DPoP token).

## 2. Configuration (environment variables)

| Variable | Required | Notes |
| --- | --- | --- |
| `RELAY_PUBLIC_ORIGIN` | yes | Public `https://` origin (through your ingress). No trailing slash. |
| `DATABASE_PATH` | yes | SQLite file path. In the container: `/data/relay.db` (mounted volume). |
| `PORT` | no | HTTP listen port (default `8787`). |
| `RELAY_CLOUD_MINT_PRIVATE_KEY` / `_PUBLIC_KEY` | yes | From `gen-keys`. |
| `RELAY_AUTH_SESSION_PRIVATE_KEY` / `_PUBLIC_KEY` | yes | From `gen-keys`. |
| `RELAY_REGISTRATION_INVITE_CODE` | no | If set, required to register. Unset = open registration. |

Docker Swarm secrets are read from `/run/secrets/<NAME>` when the matching env var
is unset (handled in `src/server.ts`). `stack.yml` mounts each key as a secret
whose target is the env var name.

## 3. Build & deploy (Docker Swarm)

```sh
# Build (context = repo root)
docker build -t stofloos-relay:latest -f infra/relay/Dockerfile .

# Create secrets (once)
bun infra/relay/scripts/gen-keys.ts   # copy values into files, then:
printf %s "$CLOUD_MINT_PRIV"  | docker secret create relay_cloud_mint_private_key -
printf %s "$CLOUD_MINT_PUB"   | docker secret create relay_cloud_mint_public_key -
printf %s "$AUTH_SESS_PRIV"   | docker secret create relay_auth_session_private_key -
printf %s "$AUTH_SESS_PUB"    | docker secret create relay_auth_session_public_key -
printf %s "$INVITE_CODE"      | docker secret create relay_registration_invite_code -

# Label the node that will hold the SQLite volume, then deploy
docker node update --label-add stofloos_relay=true <node>
RELAY_PUBLIC_ORIGIN=https://relay.example.com \
  docker stack deploy -c infra/relay/stack.yml stofloos
```

TLS/ingress is **not** part of the stack — front the published port with your own
reverse proxy (Traefik/Caddy/nginx) terminating HTTPS for `RELAY_PUBLIC_ORIGIN`.

SQLite is single-writer: keep `replicas: 1` and pin to one node.

## 4. Point clients at the relay

Build the desktop/web/mobile apps with `T3CODE_RELAY_URL=$RELAY_PUBLIC_ORIGIN`
(the Clerk build vars are removed in Phase 2). See the top-level plan for the
client auth swap.
