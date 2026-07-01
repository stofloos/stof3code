import { eq } from "drizzle-orm";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import * as RelayDb from "../db.ts";
import { relayUsers } from "../persistence/schema.ts";

export class UserPersistenceError extends Schema.TaggedErrorClass<UserPersistenceError>()(
  "UserPersistenceError",
  {
    operation: Schema.Literals(["create", "lookup"]),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Relay user query '${this.operation}' failed`;
  }
}

export class UserEmailTakenError extends Schema.TaggedErrorClass<UserEmailTakenError>()(
  "UserEmailTakenError",
  { email: Schema.String },
) {
  override get message(): string {
    return `A user already exists for email '${this.email}'`;
  }
}

export interface RelayUserRecord {
  readonly userId: string;
  readonly email: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class Users extends Context.Service<
  Users,
  {
    readonly create: (input: {
      readonly email: string;
      readonly password: string;
    }) => Effect.Effect<RelayUserRecord, UserEmailTakenError | UserPersistenceError>;
    readonly verifyCredentials: (input: {
      readonly email: string;
      readonly password: string;
    }) => Effect.Effect<RelayUserRecord | null, UserPersistenceError>;
  }
>()("t3code-relay/auth/Users") {}

const make = Effect.gen(function* () {
  const db = yield* RelayDb.RelayDb;

  const findByEmail = (email: string) =>
    Effect.try({
      try: () =>
        db
          .select({
            userId: relayUsers.userId,
            email: relayUsers.email,
            passwordHash: relayUsers.passwordHash,
          })
          .from(relayUsers)
          .where(eq(relayUsers.email, normalizeEmail(email)))
          .limit(1)
          .all(),
      catch: (cause) => new UserPersistenceError({ operation: "lookup", cause }),
    }).pipe(Effect.map((rows) => rows[0] ?? null));

  const create: Users["Service"]["create"] = Effect.fn("relay.users.create")(function* (input) {
    const email = normalizeEmail(input.email);
    const existing = yield* findByEmail(email);
    if (existing) {
      return yield* new UserEmailTakenError({ email });
    }
    const now = DateTime.formatIso(yield* DateTime.now);
    // @effect-diagnostics-next-line cryptoRandomUUIDInEffect:off - opaque user id, no injected randomness needed
    const userId = yield* Effect.sync(() => crypto.randomUUID());
    const passwordHash = yield* Effect.tryPromise({
      try: () => Bun.password.hash(input.password),
      catch: (cause) => new UserPersistenceError({ operation: "create", cause }),
    });
    yield* Effect.try({
      try: () =>
        db
          .insert(relayUsers)
          .values({ userId, email, passwordHash, createdAt: now, updatedAt: now })
          .run(),
      catch: (cause) => new UserPersistenceError({ operation: "create", cause }),
    });
    return { userId, email };
  });

  const verifyCredentials: Users["Service"]["verifyCredentials"] = Effect.fn(
    "relay.users.verify_credentials",
  )(function* (input) {
    const record = yield* findByEmail(input.email);
    if (!record) {
      return null;
    }
    const ok = yield* Effect.tryPromise({
      try: () => Bun.password.verify(input.password, record.passwordHash),
      catch: (cause) => new UserPersistenceError({ operation: "lookup", cause }),
    });
    return ok ? { userId: record.userId, email: record.email } : null;
  });

  return Users.of({ create, verifyCredentials });
});

export const layer = Layer.effect(Users, make);
