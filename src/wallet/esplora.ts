// The two things WDK's BTC module does not tell us, read from the Bitcoin
// network's esplora API (src/config/btcChain.ts `esploraApi`: Mutinynet's,
// or Bitkit's staging regtest mempool):
//
// - the current fee rate in sats per virtual byte, so the Send review can
//   say "1 sat/vB" and pass the same rate to WDK for the quote and the send
//   (WDK otherwise estimates its own rate and does not report it);
// - when a transaction was confirmed, because WDK's transfer list carries
//   only a block height.
//
// Parsers are pure and unit tested; the fetchers are thin. Each fetch gives
// up after FETCH_TIMEOUT_MS (./http.ts): React Native's fetch never times
// out on its own, and a stalled API must not leave the Send screen waiting
// forever. Callers fall back (WDK estimates its own fee rate) when a fetch
// fails.
import { BTC_CHAIN } from '../config/btcChain';
import { fetchJsonWithTimeout } from './http';
import { isTxid } from './txid';

/** The minimum relay rate (Mutinynet and regtest alike). Also the fallback when the API is unsure. */
export const MIN_BTC_FEE_RATE = 1n;

/** `/v1/fees/recommended` -> sats/vB for the next block, at least 1. */
export function parseRecommendedFeeRate(json: unknown): bigint | undefined {
  const fastest = (json as { fastestFee?: unknown } | null)?.fastestFee;
  if (typeof fastest !== 'number' || !Number.isFinite(fastest) || fastest <= 0) return undefined;
  const rate = BigInt(Math.ceil(fastest));
  return rate < MIN_BTC_FEE_RATE ? MIN_BTC_FEE_RATE : rate;
}

export async function fetchBtcFeeRate(): Promise<bigint | undefined> {
  return parseRecommendedFeeRate(await fetchJsonWithTimeout(`${BTC_CHAIN.esploraApi}/v1/fees/recommended`));
}

export type BtcTransactionStatus = { confirmed: boolean; blockHeight?: number; blockTime?: number };

/** `/tx/<txid>/status` -> confirmation and block time (ms). */
export function parseTransactionStatus(json: unknown): BtcTransactionStatus | undefined {
  const status = json as { confirmed?: unknown; block_height?: unknown; block_time?: unknown } | null;
  if (!status || typeof status.confirmed !== 'boolean') return undefined;
  return {
    confirmed: status.confirmed,
    blockHeight: typeof status.block_height === 'number' ? status.block_height : undefined,
    blockTime: typeof status.block_time === 'number' ? status.block_time * 1000 : undefined,
  };
}

export async function fetchBtcTransactionStatus(txid: string): Promise<BtcTransactionStatus | undefined> {
  if (!isTxid(txid)) return undefined;
  return parseTransactionStatus(await fetchJsonWithTimeout(`${BTC_CHAIN.esploraApi}/tx/${txid}/status`));
}
