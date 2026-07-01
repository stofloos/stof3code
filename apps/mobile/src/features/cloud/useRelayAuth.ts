import { useSyncExternalStore } from "react";

import {
  getRelayAuthLoadedSnapshot,
  getRelayAuthSessionSnapshot,
  loginToRelay,
  logoutFromRelay,
  readManagedRelaySessionToken,
  registerWithRelay,
  subscribeRelayAuth,
  type RelayAuthSession,
} from "./relayAuthStore";

export interface UseRelayAuthResult {
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
  const session = useSyncExternalStore(subscribeRelayAuth, getRelayAuthSessionSnapshot);
  const isLoaded = useSyncExternalStore(subscribeRelayAuth, getRelayAuthLoadedSnapshot);
  return {
    isLoaded,
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
