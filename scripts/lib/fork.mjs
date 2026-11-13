// Shared constants, the loopback check, formatUnits and fail for the local
// Arbitrum fork's scripts (scripts/fund-fork.mjs, scripts/arbitrum-fork-rpc.mjs).
// lib/demo-wallets.mjs re-exports formatUnits for the other funding scripts.
//
// No dependencies and no file reads: the fork scripts read no .env.demo and
// no secrets, and the RPC proxy loads nothing but this file and Node.

// Chain constants. They mirror src/config/chains.ts (which is TypeScript and
// cannot be imported from plain Node without a build step);
// src/config/__tests__/chains.test.ts fails if the two drift apart.
/** Arbitrum One, which the local Anvil fork keeps (ARBITRUM_ONE_CHAIN_ID in src/config/chains.ts). */
export const ARBITRUM_ONE_CHAIN_ID = 42161n;
/** USD₮0 on Arbitrum One, 6 decimals, lowercase as Bitkit writes it (ARBITRUM_USDT0 in src/config/chains.ts). */
export const ARBITRUM_USDT0 = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
/** The local Anvil fork of Arbitrum One (ARBITRUM_FORK_RPC in src/config/chains.ts). */
export const ARBITRUM_FORK_RPC = 'http://127.0.0.1:18545';

/** The only host the fork scripts talk to: this computer. */
const LOOPBACK_HOST = '127.0.0.1';

/**
 * `text` as a normalized http URL on 127.0.0.1, the address Anvil listens
 * on ('localhost' may resolve to ::1 instead). Throws for anything else;
 * `flag` names the option in the message. The fork scripts rewrite or relay
 * a local Anvil node's state, so they refuse to point at a node on another
 * machine.
 */
export function loopbackHttpUrl(text, flag) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${flag} is not a URL: "${text}"`);
  }
  if (url.protocol !== 'http:' || url.hostname !== LOOPBACK_HOST) {
    throw new Error(`${flag} must be http://127.0.0.1:<port>, not "${text}": only a node on this computer is allowed.`);
  }
  return url.href;
}

/** Format base units as a decimal string (bigint in, string out). */
export function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

/** Print `message` to stderr and stop with exit code 1. */
export function fail(message) {
  console.error(message);
  process.exit(1);
}
