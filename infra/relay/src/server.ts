// Startup config/secret reads are synchronous by necessity (before the Effect runtime).
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { existsSync, readFileSync } from "node:fs";

import * as BunHttpServer from "@effect/platform-bun/BunHttpServer";
import { layer as BunServicesLayer } from "@effect/platform-bun/BunServices";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schedule from "effect/Schedule";
import * as Etag from "effect/unstable/http/Etag";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpApiBuilder from "effect/unstable/httpapi/HttpApiBuilder";
import * as HttpApiScalar from "effect/unstable/httpapi/HttpApiScalar";

import { RelayApi } from "@t3tools/contracts/relay";

import {
  authApi,
  clientApi,
  dpopClientApi,
  healthApi,
  metadataApi,
  mobileApi,
  relayClientAuthLayer,
  relayCors,
  relayDpopClientAuthLayer,
  relayDocsRedirectRoute,
  relayEnvironmentAuthLayer,
  relayNotFoundRoute,
  serverApi,
  tokenApi,
} from "./http/Api.ts";
import * as RelayConfiguration from "./Config.ts";
import * as RelayDb from "./db.ts";
import * as DpopProofs from "./auth/DpopProofs.ts";
import * as RelayTokens from "./auth/RelayTokens.ts";
import * as SessionTokens from "./auth/SessionTokens.ts";
import * as Users from "./auth/Users.ts";
import * as EnvironmentCredentials from "./environments/EnvironmentCredentials.ts";
import * as EnvironmentLinks from "./environments/EnvironmentLinks.ts";
import * as EnvironmentConnector from "./environments/EnvironmentConnector.ts";
import * as EnvironmentLinker from "./environments/EnvironmentLinker.ts";
import * as EnvironmentPublishSignatures from "./environments/EnvironmentPublishSignatures.ts";
import * as ManagedEndpointProvider from "./environments/ManagedEndpointProvider.ts";

// --- Configuration (env, with Docker-secret file fallback) ------------------

function readEnvOrSecret(name: string): string | undefined {
  const fromEnv = process.env[name];
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  const secretPath = `/run/secrets/${name}`;
  if (existsSync(secretPath)) {
    const value = readFileSync(secretPath, "utf8").trim();
    return value.length > 0 ? value : undefined;
  }
  return undefined;
}

function requireEnvOrSecret(name: string): string {
  const value = readEnvOrSecret(name);
  if (value === undefined) {
    throw new Error(`Missing required relay configuration: ${name}`);
  }
  return value;
}

const loadSettings = Effect.sync(() => {
  const invite = readEnvOrSecret("RELAY_REGISTRATION_INVITE_CODE");
  return RelayConfiguration.make({
    relayIssuer: requireEnvOrSecret("RELAY_PUBLIC_ORIGIN"),
    cloudMintPrivateKey: Redacted.make(requireEnvOrSecret("RELAY_CLOUD_MINT_PRIVATE_KEY")),
    cloudMintPublicKey: requireEnvOrSecret("RELAY_CLOUD_MINT_PUBLIC_KEY"),
    authSessionPrivateKey: Redacted.make(requireEnvOrSecret("RELAY_AUTH_SESSION_PRIVATE_KEY")),
    authSessionPublicKey: requireEnvOrSecret("RELAY_AUTH_SESSION_PUBLIC_KEY"),
    registrationInviteCode: invite === undefined ? null : Redacted.make(invite),
    // Managed (Cloudflare-tunnel) endpoints are disabled; environments are self-managed.
    managedEndpointBaseDomain: undefined,
    managedEndpointNamespace: undefined,
  });
});

const databasePath = readEnvOrSecret("DATABASE_PATH") ?? "./relay.db";
const port = Number(readEnvOrSecret("PORT") ?? "8787");
const hostname = readEnvOrSecret("HOST") ?? "0.0.0.0";

// --- Runtime layers ---------------------------------------------------------

const webcryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.promise(async () => {
        const input = new Uint8Array(data.length);
        input.set(data);
        return new Uint8Array(await globalThis.crypto.subtle.digest(algorithm, input.buffer));
      }),
  }),
);

const runtimeLayer = Layer.empty.pipe(
  Layer.provideMerge(EnvironmentConnector.layer),
  Layer.provideMerge(EnvironmentLinker.layer),
  Layer.provideMerge(EnvironmentPublishSignatures.layer),
  Layer.provideMerge(ManagedEndpointProvider.layer),
  Layer.provideMerge(DpopProofs.layer),
  Layer.provideMerge(EnvironmentCredentials.layer),
  Layer.provideMerge(EnvironmentLinks.layer),
  Layer.provideMerge(RelayTokens.layer),
  Layer.provideMerge(SessionTokens.layer),
  Layer.provideMerge(Users.layer),
  Layer.provideMerge(RelayDb.layer(databasePath)),
  Layer.provideMerge(Layer.effect(RelayConfiguration.RelayConfiguration, loadSettings)),
  Layer.provideMerge(webcryptoLayer),
  Layer.provideMerge(FetchHttpClient.layer),
);

const appLayer = Layer.mergeAll(
  healthApi,
  metadataApi,
  authApi,
  mobileApi,
  clientApi,
  tokenApi,
  dpopClientApi,
  serverApi,
).pipe(
  Layer.provideMerge(relayClientAuthLayer),
  Layer.provideMerge(relayDpopClientAuthLayer),
  Layer.provideMerge(relayEnvironmentAuthLayer),
  Layer.provide(runtimeLayer),
);

const routesLayer = Layer.mergeAll(
  HttpApiBuilder.layer(RelayApi, { openapiPath: "/openapi.json" }).pipe(Layer.provide(appLayer)),
  HttpApiScalar.layer(RelayApi, { path: "/docs" }),
  relayDocsRedirectRoute,
  relayNotFoundRoute,
).pipe(Layer.provide([Etag.layerWeak, relayCors]));

// Periodically prune expired DPoP replay records (replaces the Cloudflare cron).
const dpopPruneLayer = Layer.effectDiscard(
  Effect.forkScoped(
    DpopProofs.DpopProofReplay.pipe(
      Effect.flatMap((proofs) => proofs.pruneExpired),
      Effect.catchCause((cause) => Effect.logWarning("relay dpop prune failed", { cause })),
      Effect.repeat(Schedule.spaced("5 minutes")),
      Effect.provide(runtimeLayer),
    ),
  ),
);

const MainLayer = Layer.mergeAll(
  HttpRouter.serve(routesLayer),
  dpopPruneLayer,
).pipe(
  Layer.provide(BunHttpServer.layer({ port, hostname })),
  Layer.provide(BunServicesLayer),
);

BunRuntime.runMain(
  Layer.launch(MainLayer).pipe(
    Effect.tapCause((cause: unknown) => Effect.logError("relay server crashed", { cause })),
  ),
);
