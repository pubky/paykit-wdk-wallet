// A JSON fetch that gives up after FETCH_TIMEOUT_MS. React Native's fetch
// never times out on its own, and a stalled API must not leave a screen or
// a payment check waiting forever. Used for the Bitcoin network's esplora
// (./esplora.ts) and the EVM chain's JSON-RPC (./usePaymentChecks.ts).
export const FETCH_TIMEOUT_MS = 5_000;

/** GET (or `init`, such as a JSON-RPC POST) and parse JSON; undefined on an HTTP error, throws on a network error or timeout. */
export async function fetchJsonWithTimeout(url: string, init?: { method: 'POST'; body: string }): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = init ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' };
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (!response.ok) return undefined;
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}
