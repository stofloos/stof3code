import { resolveCloudPublicConfig } from "./publicConfig";

// Relay-as-IdP session for the web/desktop renderer. The relay's session JWT is
// what the ManagedRelayClient forwards as the DPoP-exchange subject token (the
// slot Clerk's session token used to fill).
export interface RelayAuthSession {
  readonly token: string;
  readonly userId: string;
  readonly email: string;
  readonly expiresAtMs: number;
}

const STORAGE_KEY = "stofloos:relay-auth";
const FALLBACK_TTL_MS = 29 * 24 * 60 * 60 * 1_000;

const listeners = new Set<() => void>();

function loadPersisted(): RelayAuthSession | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RelayAuthSession>;
    if (
      typeof parsed.token === "string" &&
      typeof parsed.userId === "string" &&
      typeof parsed.email === "string" &&
      typeof parsed.expiresAtMs === "number"
    ) {
      return parsed as RelayAuthSession;
    }
  } catch {
    // fall through to no session
  }
  return null;
}

let currentSession: RelayAuthSession | null = loadPersisted();

function persist(session: RelayAuthSession | null): void {
  try {
    if (session) {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    }
  } catch {
    // storage unavailable (private mode / SSR) — keep the in-memory session only
  }
}

function setSession(session: RelayAuthSession | null): void {
  currentSession = session;
  persist(session);
  for (const listener of listeners) listener();
}

export function subscribeRelayAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRelayAuthSession(): RelayAuthSession | null {
  if (currentSession && currentSession.expiresAtMs <= Date.now()) {
    setSession(null);
    return null;
  }
  return currentSession;
}

/** Provider handed to ManagedRelayClient; returns the current session token or null. */
export async function readManagedRelaySessionToken(): Promise<string | null> {
  return getRelayAuthSession()?.token ?? null;
}

function relayBaseUrl(): string | null {
  const url = resolveCloudPublicConfig().relayUrl;
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
