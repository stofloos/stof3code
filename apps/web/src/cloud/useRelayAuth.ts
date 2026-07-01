import { useSyncExternalStore } from "react";

import {
  getRelayAuthSession,
  loginToRelay,
  logoutFromRelay,
  readManagedRelaySessionToken,
  registerWithRelay,
  subscribeRelayAuth,
  type RelayAuthSession,
} from "./relayAuthStore";

export interface UseRelayAuthResult {
  /** Always true — the session is read synchronously from local storage. */
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean;
  readonly userId: string | null;
  readonly email: string | null;
  readonly session: RelayAuthSession | null;
  /** Current session token (or null), matching the old Clerk `getToken` shape. */
  readonly getToken: () => Promise<string | null>;
  readonly login: typeof loginToRelay;
  readonly register: typeof registerWithRelay;
  readonly logout: typeof logoutFromRelay;
}

export function useRelayAuth(): UseRelayAuthResult {
  const session = useSyncExternalStore(
    subscribeRelayAuth,
    getRelayAuthSession,
    getRelayAuthSession,
  );
  return {
    isLoaded: true,
    isSignedIn: session !== null,
    userId: session?.userId ?? null,
    email: session?.email ?? null,
    session,
    getToken: readManagedRelaySessionToken,
    login: loginToRelay,
    register: registerWithRelay,
    logout: logoutFromRelay,
  };
}
