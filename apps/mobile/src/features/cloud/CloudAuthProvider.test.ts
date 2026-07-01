import { managedRelaySessionAtom } from "@t3tools/client-runtime/relay";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { appAtomRegistry } from "../../state/atom-registry";
import { activateCloudRelayAccount, deactivateCloudRelayAccount } from "./CloudAuthProvider";
import { setAgentAwarenessRelayTokenProvider } from "../agent-awareness/remoteRegistration";

vi.mock("./relayAuthStore", () => ({
  readManagedRelaySessionToken: vi.fn(async () => null),
}));

vi.mock("./useRelayAuth", () => ({
  useRelayAuth: vi.fn(),
}));

vi.mock("../../lib/runtime", () => ({
  runtime: {
    runPromiseExit: vi.fn(),
  },
}));

vi.mock("../../connection/catalog", () => ({
  environmentCatalog: {
    removeRelayEnvironments: {},
  },
}));

vi.mock("./publicConfig", () => ({
  resolveCloudPublicConfig: vi.fn(() => ({
    relay: { url: null },
  })),
}));

vi.mock("../agent-awareness/remoteRegistration", () => ({
  setAgentAwarenessRelayTokenProvider: vi.fn(),
  unregisterAgentAwarenessDeviceForCurrentUser: vi.fn(),
}));

afterEach(() => {
  deactivateCloudRelayAccount();
  vi.clearAllMocks();
});

describe("CloudAuthProvider relay account isolation", () => {
  it("clears relay and agent-awareness credentials before cleanup can fail", async () => {
    const tokenProvider = async () => "account-1-token";
    activateCloudRelayAccount("account-1", tokenProvider);
    expect(appAtomRegistry.get(managedRelaySessionAtom)?.accountId).toBe("account-1");

    deactivateCloudRelayAccount();
    const cleanup = Promise.reject(new Error("Persistence removal failed.")).catch(() => undefined);

    expect(appAtomRegistry.get(managedRelaySessionAtom)).toBeNull();
    expect(vi.mocked(setAgentAwarenessRelayTokenProvider)).toHaveBeenLastCalledWith(null);
    await cleanup;
  });
});
