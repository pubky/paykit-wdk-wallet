// A JSON fetch that gives up after a timeout: FETCH_TIMEOUT_MS unless the
// caller passes its own. React Native's fetch never times out on its own,
// and a stalled API must not leave a screen or a payment check waiting
// forever. Used at the default for the Bitcoin network's esplora
// (./esplora.ts) and the EVM chain's JSON-RPC (./usePaymentChecks.ts), and
// with a longer timeout for Blockscout (./useActivity.ts), which is often
// slow but working.
export const FETCH_TIMEOUT_MS = 5_000;

/** GET (or `init`, such as a JSON-RPC POST) and parse JSON; undefined on an HTTP error, throws on a network error or timeout. */
export async function fetchJsonWithTimeout(url: string, init?: { method: 'POST'; body: string }, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  return withTimeout(url, init, timeoutMs, async (response) => (response.ok ? response.json() : undefined));
}

/** GET and parse JSON; throws `<service> answered <status>` on an HTTP error, and on a network error or timeout. */
export async function fetchJsonOrThrowWithTimeout(url: string, service: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<unknown> {
  return withTimeout(url, undefined, timeoutMs, async (response) => {
    if (!response.ok) throw new Error(`${service} answered ${response.status}`);
    return response.json();
  });
}

/** Fetch and read the response, aborting both if they take longer than `timeoutMs`. */
async function withTimeout<T>(
  url: string,
  init: { method: 'POST'; body: string } | undefined,
  timeoutMs: number,
  read: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = init ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' };
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    return await read(response);
  } finally {
    clearTimeout(timer);
  }
}
