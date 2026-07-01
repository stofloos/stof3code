import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as HttpBody from "effect/unstable/http/HttpBody";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import { relayUrlConfig } from "./publicConfig.ts";

const CLOUD_CLI_SESSION_SECRET = "cloud-cli-session-token";
const CLOUD_CLI_SESSION_EARLY_MS = 60_000;
const FALLBACK_TTL_MS = 29 * 24 * 60 * 60 * 1_000;

const PersistedToken = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAtEpochMs: Schema.Number,
});
type PersistedToken = typeof PersistedToken.Type;

const PersistedTokenJson = Schema.fromJsonString(PersistedToken);
const decodePersistedToken = Schema.decodeUnknownEffect(PersistedTokenJson);
const encodePersistedToken = Schema.encodeEffect(PersistedTokenJson);

const RelaySessionResponse = Schema.Struct({
  sessionToken: Schema.String,
  userId: Schema.String,
  expiresAt: Schema.String,
});

export class CloudCliCredentialRemovalError extends Schema.TaggedErrorClass<CloudCliCredentialRemovalError>()(
  "CloudCliCredentialRemovalError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not remove the stored Stofloos Connect CLI credential.";
  }
}

export class CloudCliCredentialReadError extends Schema.TaggedErrorClass<CloudCliCredentialReadError>()(
  "CloudCliCredentialReadError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not read the stored Stofloos Connect CLI credential.";
  }
}

export class CloudCliAuthorizationError extends Schema.TaggedErrorClass<CloudCliAuthorizationError>()(
  "CloudCliAuthorizationError",
  { cause: Schema.Defect() },
) {
  override get message(): string {
    return "Could not authorize the Stofloos Connect CLI.";
  }
}

export const CloudCliTokenManagerError = Schema.Union([
  CloudCliCredentialRemovalError,
  CloudCliCredentialReadError,
  CloudCliAuthorizationError,
]);
export type CloudCliTokenManagerError = typeof CloudCliTokenManagerError.Type;

export class CloudCliTokenManager extends Context.Service<
  CloudCliTokenManager,
  {
    readonly get: Effect.Effect<PersistedToken, CloudCliTokenManagerError>;
    readonly getExisting: Effect.Effect<Option.Option<PersistedToken>, CloudCliTokenManagerError>;
    readonly hasCredential: Effect.Effect<boolean, CloudCliTokenManagerError>;
    readonly clear: Effect.Effect<void, CloudCliTokenManagerError>;
  }
>()("t3/cloud/CliTokenManager/CloudCliTokenManager") {}

const wrapError =
  <WrappedError extends CloudCliTokenManagerError>(makeError: (cause: unknown) => WrappedError) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, WrappedError, R> =>
    effect.pipe(Effect.mapError(makeError));

function stringToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToString(value: Uint8Array): string {
  return new TextDecoder().decode(value);
}

// Reads relay credentials from the terminal (or T3CODE_RELAY_EMAIL/PASSWORD env vars
// for non-interactive use). The password is masked when prompted interactively.
async function readRelayCredentials(): Promise<{ readonly email: string; readonly password: string }> {
  const envEmail = process.env.T3CODE_RELAY_EMAIL?.trim();
  const envPassword = process.env.T3CODE_RELAY_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }
  const readline = await import("node:readline");
  const prompt = (query: string, hidden: boolean): Promise<string> =>
    new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });
      if (hidden) {
        const rlAny = rl as unknown as {
          _writeToOutput?: (value: string) => void;
          output?: NodeJS.WriteStream;
        };
        let promptShown = false;
        rlAny._writeToOutput = (value: string) => {
          if (!promptShown) {
            rlAny.output?.write(query);
            promptShown = true;
          } else if (value.trim().length === 0) {
            rlAny.output?.write(value);
          } else {
            rlAny.output?.write("*");
          }
        };
      }
      rl.question(query, (answer) => {
        rl.close();
        if (hidden) {
          process.stdout.write("\n");
        }
        resolve(answer.trim());
      });
    });
  const email = envEmail ?? (await prompt("Stofloos email: ", false));
  const password = await prompt("Stofloos password: ", true);
  return { email, password };
}

export const make = Effect.gen(function* () {
  const httpClient = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const semaphore = yield* Semaphore.make(1);

  const persist = Effect.fn("cloud.cli_token.persist")(function* (token: PersistedToken) {
    const encoded = yield* encodePersistedToken(token);
    yield* secrets.set(CLOUD_CLI_SESSION_SECRET, stringToBytes(encoded));
    return token;
  });

  const clear = secrets
    .remove(CLOUD_CLI_SESSION_SECRET)
    .pipe(wrapError((cause) => new CloudCliCredentialRemovalError({ cause })));

  const read = Effect.fn("cloud.cli_token.read")(function* () {
    const encoded = yield* secrets.get(CLOUD_CLI_SESSION_SECRET);
    if (Option.isNone(encoded)) return Option.none<PersistedToken>();
    return Option.some(yield* decodePersistedToken(bytesToString(encoded.value)));
  });

  const login = Effect.fn("cloud.cli_token.login")(function* () {
    const relayUrl = (yield* relayUrlConfig).replace(/\/+$/u, "");
    yield* Console.log("Sign in to Stofloos Connect.");
    const credentials = yield* Effect.promise(() => readRelayCredentials());
    const request = HttpClientRequest.post(`${relayUrl}/v1/auth/login`).pipe(
      HttpClientRequest.setBody(
        // @effect-diagnostics-next-line preferSchemaOverJson:off - fixed { email, password } login body
        HttpBody.text(JSON.stringify(credentials), "application/json"),
      ),
    );
    const response = yield* httpClient
      .execute(request)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(RelaySessionResponse)));
    const now = yield* Clock.currentTimeMillis;
    const expiresAtMs = Date.parse(response.expiresAt);
    return {
      accessToken: response.sessionToken,
      refreshToken: "",
      expiresAtEpochMs: Number.isNaN(expiresAtMs) ? now + FALLBACK_TTL_MS : expiresAtMs,
    } satisfies PersistedToken;
  });

  const getExistingNoLock = Effect.fn("cloud.cli_token.get_existing_no_lock")(function* () {
    const token = yield* read();
    if (Option.isNone(token)) return token;
    const now = yield* Clock.currentTimeMillis;
    // The relay session JWT cannot be silently refreshed; require a fresh login once expired.
    return token.value.expiresAtEpochMs - CLOUD_CLI_SESSION_EARLY_MS > now
      ? token
      : Option.none<PersistedToken>();
  });

  const getExisting = semaphore.withPermits(1)(
    getExistingNoLock().pipe(wrapError((cause) => new CloudCliCredentialReadError({ cause }))),
  );
  const hasCredential = semaphore.withPermits(1)(
    read().pipe(
      Effect.map(Option.isSome),
      wrapError((cause) => new CloudCliCredentialReadError({ cause })),
    ),
  );
  const get = semaphore.withPermits(1)(
    Effect.gen(function* () {
      const token = yield* getExistingNoLock();
      return Option.isSome(token) ? token.value : yield* login().pipe(Effect.flatMap(persist));
    }).pipe(wrapError((cause) => new CloudCliAuthorizationError({ cause }))),
  );

  return CloudCliTokenManager.of({ get, getExisting, hasCredential, clear });
});

export const layer = Layer.effect(CloudCliTokenManager, make);
