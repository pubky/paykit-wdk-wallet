// A JSON fetch that gives up after a timeout: FETCH_TIMEOUT_MS unless the
// caller passes its own. React Native's fetch never times out on its own,
// and a stalled API must not leave a screen or a payment check waiting
// forever. Used at the default for the Bitcoin network's esplora
// (./esplora.ts) and the EVM chain's JSON-RPC (./usePaymentChecks.ts), and
// with a longer timeout for Blockscout (./useActivity.ts), which is often
// slow but working.
export const FETCH_TIMEOUT_MS = 5_000;

/** An HTTP error answer (not a network error or timeout), so a caller can treat it on its own. */
export class HttpStatusError extends Error {
  readonly status: number;

  constructor(service: string, status: number) {
    super(`${service} answered ${status}`);
    this.name = 'HttpStatusError';
    this.status = status;
  }
}

/**
 * GET (or `init`, such as a JSON-RPC POST) and parse JSON. Throws
 * HttpStatusError (`<service> answered <status>`) on an HTTP error, and
 * throws on a network error or timeout.
 */
export async function fetchJsonWithTimeout(
  url: string,
  service: string,
  options: { init?: { method: 'POST'; body: string }; timeoutMs?: number } = {},
): Promise<unknown> {
  const { init, timeoutMs = FETCH_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = init ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' };
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) throw new HttpStatusError(service, response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
