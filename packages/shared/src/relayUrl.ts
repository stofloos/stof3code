const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

export function normalizeSecureRelayUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    // https everywhere; http is allowed only for loopback hosts (local dev/testing),
    // which cannot be intercepted on the network.
    const protocolAllowed =
      url.protocol === "https:" ||
      (url.protocol === "http:" && isLoopbackHostname(url.hostname));
    if (
      !protocolAllowed ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      !/^\/+$/u.test(url.pathname)
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isSecureRelayUrl(value: string): boolean {
  return normalizeSecureRelayUrl(value) !== null;
}
