// Paying a person by their pubky through their PUBLIC payment endpoints:
// what they accept, and what to tell the payer when they can't be paid.
//
// The SDK does the lookup (PaykitService.resolvePeer: their app registry,
// `resolvePublicContactPayment`, their profile). Its answer is someone
// else's published data, so this file re-checks it before the wallet
// sends anything:
//
// - an endpoint must belong to the pubky we asked about;
// - its payload must pass our own endpoint parser (./endpoints.ts): a
//   BTC address on the build's network (tb1 on Mutinynet, bcrt1 on
//   Bitkit's regtest), and for USD₮ an EVM address on the build's EVM
//   chain (src/config/evmChain.ts) naming the exact token contract this
//   wallet holds;
// - the first valid endpoint per asset wins (the SDK returns them in the
//   adapter's preference order).
//
// This file has no native imports and is unit tested. The SDK enum is
// mapped to `PublicPaymentStatus` in ./publicPayments.ts.
import { EVM_CHAIN, EVM_REAL_FUNDS } from '../config/evmChain';
import { ASSETS } from '../wallet/assets';
import { parseEndpoint } from './endpoints';

/** The assets a person can be paid in. */
export type PayeeAsset = 'btc' | 'usdt';

/** The SDK's resolution status, in this app's words. */
export type PublicPaymentStatus = 'payable' | 'no-endpoint' | 'unsupported' | 'unavailable';

/** One resolved public endpoint, as plain data. */
export type ResolvedEndpointData = {
  counterparty: string;
  identifier: string;
  /** The payment target payload our adapter built (canonical JSON). */
  payloadText: string;
};

export type PublicPaymentOptions = {
  publicKey: string;
  status: PublicPaymentStatus;
  /** They have a Paykit app registry, i.e. a wallet that speaks Paykit. */
  hasPaymentApp: boolean;
  /** Where each asset they accept is paid. */
  addresses: Partial<Record<PayeeAsset, string>>;
  /** How many of their apps' endpoint lists could not be loaded. */
  failedApps: number;
};

export function publicPaymentOptionsFrom(input: {
  publicKey: string;
  status: PublicPaymentStatus;
  hasPaymentApp: boolean;
  endpoints: readonly ResolvedEndpointData[];
  failedApps: number;
}): PublicPaymentOptions {
  const addresses: Partial<Record<PayeeAsset, string>> = {};
  for (const endpoint of input.endpoints) {
    if (endpoint.counterparty !== input.publicKey) continue;
    const parsed = parseEndpoint(endpoint.identifier, endpoint.payloadText);
    if (parsed && addresses[parsed.asset] === undefined) addresses[parsed.asset] = parsed.address;
  }
  // "Payable" with nothing we could parse is, for this wallet, unsupported.
  const status = input.status === 'payable' && Object.keys(addresses).length === 0 ? 'unsupported' : input.status;
  return { publicKey: input.publicKey, status, hasPaymentApp: input.hasPaymentApp, addresses, failedApps: input.failedApps };
}

/** The assets they accept, in display order. */
export function acceptedAssets(options: PublicPaymentOptions): PayeeAsset[] {
  return (['btc', 'usdt'] as const).filter((asset) => options.addresses[asset] !== undefined);
}


/**
 * Why `name` can't be paid in `asset` by pubky, as a sentence with a next
 * step (docs/DESIGN.md, "Writing"), or undefined if they can.
 */
export function cannotPayReason(options: PublicPaymentOptions, asset: PayeeAsset, name: string): string | undefined {
  if (options.addresses[asset] !== undefined) return undefined;
  if (!options.hasPaymentApp) {
    return `${name} hasn't set up a wallet that takes payments by pubky. Ask them for an address instead.`;
  }
  if (options.status === 'unavailable') {
    return `Couldn't load ${name}'s payment details from their homeserver. Try again in a moment.`;
  }
  const accepted = acceptedAssets(options);
  if (accepted.length > 0) {
    const other = accepted.map((a) => ASSETS[a].displayName).join(' or ');
    return `${name} doesn't accept ${ASSETS[asset].displayName} by pubky. Choose ${other} instead.`;
  }
  if (options.status === 'unsupported') {
    return `${name} publishes payment details this wallet can't use. Ask them for ${addressToAskFor(asset)} instead.`;
  }
  return `${name} doesn't publish any payment addresses. Ask them for an address, or add each other as contacts.`;
}

/**
 * The address to ask a payee for in `asset`. On a real-funds build only
 * USD₮ is real money: its Bitcoin is still on a test network.
 */
function addressToAskFor(asset: PayeeAsset): string {
  if (!EVM_REAL_FUNDS) return 'a test-network address';
  return asset === 'btc' ? 'a test-network Bitcoin address' : `a USD₮ address on ${EVM_CHAIN.networkName}`;
}
