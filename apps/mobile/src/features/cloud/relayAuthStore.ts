import * as SecureStore from "expo-secure-store";

import { resolveCloudPublicConfig } from "./publicConfig";

// Relay-as-IdP session for the mobile app, persisted in expo-secure-store. The
// relay's session JWT is the string ManagedRelayClient forwards as the DPoP
// subject token (the slot Clerk's session token used to fill).
export interface RelayAuthSession {
  readonly token: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAtMs: number;
}

const STORAGE_KEY = "t3code.cloud.relay-session";
const FALLBACK_TTL_MS = 29 * 24 * 60 * 60 * 1_000;

const listeners = new Set<() => void>();
let currentSession: RelayAuthSession | null = null;
let loaded = false;

function notify(): void {
  for (const listener of listeners) listener();
}

function isValidSession(value: unknown): value is RelayAuthSession {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as RelayAuthSession).token === "string" &&
    typeof (value as RelayAuthSession).userId === "string" &&
    typeof (value as RelayAuthSession).email === "string" &&
    typeof (value as RelayAuthSession).expiresAtMs === "number"
  );
}

async function persist(session: RelayAuthSession | null): Promise<void> {
  try {
    if (session) {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(session));
    } else {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    }
  } catch {
    // secure store unavailable — keep the in-memory session only
  }
}

function setSession(session: RelayAuthSession | null): void {
  currentSession = session;
  void persist(session);
  notify();
}

async function initLoad(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isValidSession(parsed) && parsed.expiresAtMs > Date.now()) {
        currentSession = parsed;
      }
    }
  } catch {
    // ignore — start signed out
  }
  loaded = true;
  notify();
}
void initLoad();

export function subscribeRelayAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRelayAuthSessionSnapshot(): RelayAuthSession | null {
  return currentSession;
}

export function getRelayAuthLoadedSnapshot(): boolean {
  return loaded;
}

/** Provider handed to ManagedRelayClient; returns the current session token or null. */
export async function readManagedRelaySessionToken(): Promise<string | null> {
  const session = currentSession;
  if (!session) return null;
  if (session.expiresAtMs <= Date.now()) {
    setSession(null);
    return null;
  }
  return session.token;
}

function relayBaseUrl(): string | null {
  const url = resolveCloudPublicConfig().relay.url;
  return url ? url.replace(/\/+$/u, "") : null;
}

async function relayAuthErrorMessage(response: Response, isLogin: boolean): Promise<string> {
  try {
    const body = (await response.json()) as { readonly reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    switch (reason) {
      case "invalid_credentials":
        return "Invalid email or password.";
      case "email_taken":
        return "An account already exists for that email.";
      case "invite_required":
        return "An invite code is required to register.";
      case "invite_invalid":
        return "That invite code is not valid.";
      case "persistence_failed":
        return "The relay could not complete the request. Try again.";
      default:
        break;
    }
  } catch {
    // no JSON body
  }
  return isLogin ? "Could not sign in." : "Could not create the account.";
}

async function authRequest(
  path: "/v1/auth/login" | "/v1/auth/register",
  body: Record<string, string>,
): Promise<RelayAuthSession> {
  const base = relayBaseUrl();
  if (!base) {
    throw new Error("The cloud relay is not configured.");
  }
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the cloud relay.");
  }
  if (!response.ok) {
    throw new Error(await relayAuthErrorMessage(response, path.endsWith("login")));
  }
  const data = (await response.json()) as {
    readonly sessionToken: string;
    readonly userId: string;
    readonly expiresAt: string;
  };
  const parsedExpiry = Date.parse(data.expiresAt);
  const session: RelayAuthSession = {
    token: data.sessionToken,
    userId: data.userId,
    email: body.email ?? "",
    expiresAtMs: Number.isNaN(parsedExpiry) ? Date.now() + FALLBACK_TTL_MS : parsedExpiry,
  };
  setSession(session);
  return session;
}

export function loginToRelay(input: {
  readonly email: string;
  readonly password: string;
}): Promise<RelayAuthSession> {
  return authRequest("/v1/auth/login", { email: input.email, password: input.password });
}

export function registerWithRelay(input: {
  readonly email: string;
  readonly password: string;
  readonly inviteCode?: string;
}): Promise<RelayAuthSession> {
  return authRequest("/v1/auth/register", {
    email: input.email,
    password: input.password,
    ...(input.inviteCode ? { inviteCode: input.inviteCode } : {}),
  });
}

export function logoutFromRelay(): void {
  setSession(null);
}
