# Stofloos — setup, run & deploy (every platform)

Stofloos is a multi-platform coding-agent app (desktop / web / mobile / CLI) plus a self-hosted
**relay** for Stofloos Connect (linking remote environments + mobile pairing). The relay is its own
identity provider (email/password → session JWT); there is no Clerk and no Cloud­flare/Expo cloud.

This guide covers **every platform**: prerequisites, local dev/run, release builds, and deploying
the relay. Deep-dives: [`BUILD.md`](../BUILD.md) (release artifacts) and
[`infra/relay/DEPLOY.md`](../infra/relay/DEPLOY.md) (relay production deploy).

---

## 1. One config value for the clients

Every client (desktop/web/mobile/CLI) needs one thing: the relay's origin, as **`T3CODE_RELAY_URL`**.
Put it in the **repo-root `.env`** — the build reads it via `scripts/lib/public-config.ts` and injects
it into each client (`VITE_T3CODE_RELAY_URL` for web, Expo `extra.relay.url` for mobile, etc.).

```sh
# .env  (repo root)
T3CODE_RELAY_URL=https://relay.example.com    # production
# for local testing use the loopback origin (http is allowed for loopback only):
# T3CODE_RELAY_URL=http://localhost:8787
```

Install workspace deps once: `pnpm install`. (Requires Node ≥ 22, pnpm 10, and Bun ≥ 1.3 for the relay.)

---

## 2. Relay

The relay is a Bun + SQLite service. It is its own IdP (`/v1/auth/register|login`) and issues the
DPoP-bound tokens clients use to reach linked environments.

### 2a. Run the relay locally

```sh
cd infra/relay
bun scripts/gen-keys.ts >> .env.local          # EdDSA keypairs (cloud-mint + auth-session)
cat >> .env.local <<'EOF'
RELAY_PUBLIC_ORIGIN=http://localhost:8787
DATABASE_PATH=./relay.db
PORT=8787
# RELAY_REGISTRATION_INVITE_CODE=change-me      # optional: gate sign-ups
EOF
bun src/server.ts                              # Bun auto-loads .env.local
```

- `curl http://localhost:8787/health` → `{"ok":true,"service":"relay"}`.
- Create an account: `curl -XPOST http://localhost:8787/v1/auth/register -H 'content-type: application/json' -d '{"email":"you@stofloos.nl","password":"..."}'`.
- Then set `T3CODE_RELAY_URL=http://localhost:8787` in the repo-root `.env` so clients target it.

### 2b. Docker (single host)

```sh
docker build -t stofloos-relay:latest -f infra/relay/Dockerfile .
docker run -p 8787:8787 -v stofloos_relay:/data \
  -e RELAY_PUBLIC_ORIGIN=https://relay.example.com \
  -e RELAY_CLOUD_MINT_PRIVATE_KEY=... -e RELAY_CLOUD_MINT_PUBLIC_KEY=... \
  -e RELAY_AUTH_SESSION_PRIVATE_KEY=... -e RELAY_AUTH_SESSION_PUBLIC_KEY=... \
  stofloos-relay:latest
```

### 2c. Docker Swarm (production)

Full guide in [`infra/relay/DEPLOY.md`](../infra/relay/DEPLOY.md). In short: put the four EdDSA keys
(+ optional invite code) into Docker **secrets**, label the node that holds the SQLite volume, then:

```sh
RELAY_PUBLIC_ORIGIN=https://relay.example.com docker stack deploy -c infra/relay/stack.yml stofloos
```

TLS/ingress is **your** responsibility — front the published port with Traefik/Caddy/nginx terminating
HTTPS for `RELAY_PUBLIC_ORIGIN`. CI builds & pushes the image to GHCR
(`.github/workflows/deploy-relay.yml`); point `stack.yml`'s `image:` at the published tag.

---

## 3. Desktop (macOS / Windows / Linux — Electron)

App id `nl.stofloos`, product name **Stofloos**.

**Dev (hot-reload):**
```sh
pnpm dev:desktop            # builds bundles + launches Electron (downloads Electron on first run)
```

**Release build** (see [`BUILD.md`](../BUILD.md) for signing):
```sh
pnpm dist:desktop:dmg:arm64   # macOS arm64 → dist/Stofloos-<version>-arm64.dmg   (run on Apple Silicon)
pnpm dist:desktop:win:x64     # Windows x64 → dist/Stofloos-<version>-x64.exe      (run on Windows)
pnpm dist:desktop:linux       # Linux x64 AppImage
```
Windows cannot be cross-built from macOS/Linux (no `wine` fallback) — build it on Windows or CI.

---

## 4. iOS (Expo, local build — no EAS)

**Prerequisites:** macOS + Xcode + CocoaPods (`pod`), an iOS Simulator (or a device + Apple Developer
account for signed builds). Bundle id `nl.stofloos`.

**Simulator (dev):**
```sh
pnpm --filter @t3tools/mobile ios:prod     # expo prebuild + build & run on the simulator
```

**Release / distribution:**
```sh
pnpm --filter @t3tools/mobile prebuild:ios      # generates apps/mobile/ios/
open apps/mobile/ios/Stofloos.xcworkspace       # Xcode → Product → Archive → Distribute
```
Set your Team in Xcode (Signing & Capabilities) for device/store builds.

---

## 5. Android (Expo, local build — no EAS)

**Prerequisites:** **JDK 17** (the repo's Java 11 is too old for release Gradle), Android SDK +
platform-tools (`ANDROID_HOME` set), an emulator or device. Package `nl.stofloos`.

**Emulator (dev):**
```sh
pnpm --filter @t3tools/mobile android:prod   # expo prebuild + build & run on the emulator/device
```

**Release artifacts:**
```sh
pnpm --filter @t3tools/mobile build:android       # APK → apps/mobile/android/app/build/outputs/apk/release/
pnpm --filter @t3tools/mobile build:android:aab   # AAB → .../bundle/release/  (Play Store)
```
Configure a release keystore in `apps/mobile/android/gradle.properties` for signed builds.

---

## 6. Web

```sh
pnpm dev:web        # Vite dev server (reads VITE_T3CODE_RELAY_URL from .env)
pnpm --filter @t3tools/web build
```

---

## 7. CLI (`t3`)

The CLI (`apps/server`) exposes Stofloos Connect from the terminal. Cloud login is email/password
against the relay (no browser OAuth): set `T3CODE_RELAY_URL`, then the CLI prompts for
email/password (or reads `T3CODE_RELAY_EMAIL` / `T3CODE_RELAY_PASSWORD`) and calls `/v1/auth/login`.

```sh
pnpm build:desktop && pnpm start        # or: npx t3@latest  (once published)
```

---

## 8. Run the full stack locally (relay + desktop + iOS Simulator)

The end-to-end Stofloos Connect test: the desktop app links its local environment to the relay, and
the iOS Simulator connects to it. The Simulator shares the Mac's network, so both reach
`http://localhost:8787`.

1. **Relay** — terminal A: `cd infra/relay && bun src/server.ts` (set up per §2a). Register a user.
2. **Config** — repo-root `.env`: `T3CODE_RELAY_URL=http://localhost:8787`.
3. **Desktop** — terminal B: `pnpm dev:desktop`. Sign in (Stofloos Connect sidebar) with the user
   from step 1; link this environment.
4. **iOS Simulator** — terminal C: `pnpm --filter @t3tools/mobile ios:prod`. Sign in with the same
   user; the linked environment appears — connect to it.

> `http://localhost` is accepted only because the relay-URL validator allows **loopback** hosts over
> http (safe: loopback isn't network-reachable). Any non-loopback relay must be `https://`.
