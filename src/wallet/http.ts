// A JSON fetch that gives up after FETCH_TIMEOUT_MS. React Native's fetch
// never times out on its own, and a stalled API must not leave a screen or
// a payment check waiting forever. Used for the Bitcoin network's esplora
// (./esplora.ts), the EVM chain's JSON-RPC (./usePaymentChecks.ts) and
// Blockscout (./useActivity.ts).
export const FETCH_TIMEOUT_MS = 5_000;

/** GET (or `init`, such as a JSON-RPC POST) and parse JSON; undefined on an HTTP error, throws on a network error or timeout. */
export async function fetchJsonWithTimeout(url: string, init?: { method: 'POST'; body: string }): Promise<unknown> {
  return withTimeout(url, init, async (response) => (response.ok ? response.json() : undefined));
}

/** GET and parse JSON; throws `<service> answered <status>` on an HTTP error, and on a network error or timeout. */
export async function fetchJsonOrThrowWithTimeout(url: string, service: string): Promise<unknown> {
  return withTimeout(url, undefined, async (response) => {
    if (!response.ok) throw new Error(`${service} answered ${response.status}`);
    return response.json();
  });
}

/** Fetch and read the response, aborting both if they take longer than FETCH_TIMEOUT_MS. */
async function withTimeout<T>(url: string, init: { method: 'POST'; body: string } | undefined, read: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = init ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' };
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    return await read(response);
  } finally {
    clearTimeout(timer);
  }
}
