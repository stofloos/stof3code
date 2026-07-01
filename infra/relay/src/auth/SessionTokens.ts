import {
  normalizeRelayIssuer,
  RelayJwtError,
  signRelayJwt,
  verifyRelayJwt,
} from "@t3tools/shared/relayJwt";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import * as RelayConfiguration from "../Config.ts";

// Login session JWT — the relay is the identity provider. This token is what the
// client sends as the `subject_token` to POST /v1/client/dpop-token (replacing the
// former Clerk session JWT). Signed with the relay's auth-session EdDSA key.
const SESSION_TYP = "t3-relay-session+jwt";
export const RELAY_SESSION_TOKEN_TTL = "30 days";

const SessionClaims = Schema.Struct({
  iss: Schema.String,
  aud: Schema.String,
  sub: Schema.String,
  email: Schema.String,
  iat: Schema.Int,
  exp: Schema.Int,
});
export type SessionClaims = typeof SessionClaims.Type;

const decodeSessionClaims = Schema.decodeUnknownEffect(SessionClaims);

export class SessionTokens extends Context.Service<
  SessionTokens,
  {
    readonly issueSession: (input: {
      readonly userId: string;
      readonly email: string;
      readonly issuedAtEpochSeconds: number;
      readonly expiresAtEpochSeconds: number;
    }) => Effect.Effect<string, RelayJwtError>;
    readonly verifySession: (input: {
      readonly token: string;
      readonly nowEpochSeconds: number;
    }) => Effect.Effect<SessionClaims | null>;
  }
>()("t3code-relay/auth/SessionTokens") {}

const make = Effect.gen(function* () {
  const config = yield* RelayConfiguration.RelayConfiguration;
  const issuer = normalizeRelayIssuer(config.relayIssuer);

  const issueSession: SessionTokens["Service"]["issueSession"] = Effect.fn(
    "relay.session.issue",
  )(function* (input) {
    return yield* signRelayJwt({
      privateKey: Redacted.value(config.authSessionPrivateKey),
      typ: SESSION_TYP,
      payload: {
        iss: issuer,
        aud: issuer,
        sub: input.userId,
        email: input.email,
        iat: input.issuedAtEpochSeconds,
        exp: input.expiresAtEpochSeconds,
      },
    });
  });

  const verifySession: SessionTokens["Service"]["verifySession"] = Effect.fn(
    "relay.session.verify",
  )((input) =>
    verifyRelayJwt({
      publicKey: config.authSessionPublicKey,
      token: input.token,
      typ: SESSION_TYP,
      issuer,
      audience: issuer,
      nowEpochSeconds: input.nowEpochSeconds,
      maxTokenAge: RELAY_SESSION_TOKEN_TTL,
    }).pipe(
      Effect.flatMap(decodeSessionClaims),
      Effect.map((claims): SessionClaims | null => claims),
      Effect.orElseSucceed(() => null),
    ),
  );

  return SessionTokens.of({ issueSession, verifySession });
});

export const layer = Layer.effect(SessionTokens, make);
