// Dev-only prefill for the simulator identities.
//
// `npm run demo-env` writes the git-ignored demo.local.ts from .env.demo.
// It holds a mnemonic and a single-use signup code per platform, plus one
// identity for Bitkit's regtest (docs/BITKIT-DEMO.md), so it must
// never be committed, logged, shown on screen or shipped in a release bundle. When the file is missing
// (a fresh clone), the app simply has no prefill.
import { Platform } from 'react-native';

import { BTC_CHAIN, type BtcChainId } from './btcChain';
import { EVM_CHAIN, type EvmChainId } from './evmChain';

export type DemoPrefill = {
  mnemonic?: string;
  signupCode?: string;
  /** The other simulator's pubky (public), to prefill the peer field. */
  peerPubky?: string;
};

export type DemoLocal = { ios?: DemoPrefill; android?: DemoPrefill; bitkitRegtest?: DemoPrefill };

function loadDemoLocal(): DemoLocal {
  // The require must sit INSIDE `if (__DEV__)`. Metro collects a bundle's
  // dependencies after inlining __DEV__ and folding constants: a dead
  // branch is removed with its require, so release bundles never contain
  // demo.local.ts. An early `if (!__DEV__) return {}` is not enough; the
  // code after it survives folding, and so would the secrets.
  if (__DEV__) {
    try {
      // Metro treats a require inside try/catch as optional, so a missing
      // file is not a bundling error.
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional file, see above
      return (require('./demo.local') as { default: DemoLocal }).default ?? {};
    } catch {
      return {};
    }
  }
  return {};
}

const local = loadDemoLocal();

// The demo identities run on Sepolia, so any other EVM mode gets no
// prefill: restoring one there would publish its usdt-arbitrum-address
// and remove usdt-sepolia-address from that shared identity
// (docs/BITKIT-USDT-FORK.md).
// A regtest build on iOS uses the regtest identity: its wallet holds
// regtest coins and pairs with Bitkit, which the demo runs on iOS
// (docs/BITKIT-DEMO.md), not with the other simulator. A regtest build on
// Android gets no prefill: the same identity on two devices at once would
// diverge its contact links, ledger and Allowances.
export function choosePrefill(demoLocal: DemoLocal, os: string, btcChain: BtcChainId, evmChain: EvmChainId): DemoPrefill | undefined {
  if (evmChain !== 'sepolia') return undefined;
  if (btcChain === 'bitkit-regtest') return os === 'ios' ? demoLocal.bitkitRegtest : undefined;
  return os === 'ios' ? demoLocal.ios : os === 'android' ? demoLocal.android : undefined;
}
export const demoPrefill: DemoPrefill = choosePrefill(local, Platform.OS, BTC_CHAIN.id, EVM_CHAIN.id) ?? {};
