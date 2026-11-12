// Which Bitcoin network the wallet runs on, chosen at build time.
//
// Default (EXPO_PUBLIC_BTC_CHAIN unset or empty): Mutinynet, as always.
// EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest: Bitkit's staging regtest, the
// network a stock Bitkit iOS Debug build uses, so this wallet and Bitkit can
// pay each other through Paykit in a demo. Any other value stops the app at
// launch: silently picking a network is how money goes to the wrong place.
//
// The profile holds everything that differs between the two: WDK's network
// name, the Electrum server, the esplora API and explorer, the address
// prefix, the Paykit endpoint id and the payment proof format. Ethereum
// (Sepolia) does not change.
//
// Expo inlines EXPO_PUBLIC_* variables into the JS bundle when Metro builds
// it, so changing the value needs a Metro restart with `--clear` (Debug), or
// a rebuild (Release, where the bundle is inside the app).
//
// No native imports: unit tested in Node, like ./chains.ts.
import {
  BITKIT_REGTEST_API,
  BITKIT_REGTEST_ELECTRUM,
  BITKIT_REGTEST_EXPLORER,
  MUTINYNET_API,
  MUTINYNET_ELECTRUM,
  MUTINYNET_EXPLORER,
  MUTINYNET_FAUCET_URL,
} from './chains';

export type BtcChainId = 'mutinynet' | 'bitkit-regtest';

export type BtcChainProfile = {
  readonly id: BtcChainId;
  /** The network's short name: "Mutinynet", "Regtest". */
  readonly displayName: 'Mutinynet' | 'Regtest';
  /** The asset's name with its network: "Bitcoin (Mutinynet)". */
  readonly networkLabel: 'Bitcoin (Mutinynet)' | 'Bitcoin (Bitkit regtest)';
  /** The network in a sentence, as Receive shows it: "Mutinynet test network". */
  readonly networkName: 'Mutinynet test network' | 'Bitkit regtest network';
  /** The coin in a sentence: "Send only Mutinynet test bitcoin to this address." */
  readonly coinName: 'Mutinynet test bitcoin' | 'regtest bitcoin';
  /** For You > Network details: the network and what kind it is. */
  readonly detailsLabel: 'Bitcoin (Mutinynet signet)' | 'Bitcoin (Bitkit regtest)';
  /** WDK wallet-btc's network: address rules and the BIP-84 coin type. */
  readonly wdkNetwork: 'testnet' | 'regtest';
  readonly electrum: { readonly host: string; readonly port: number; readonly protocol: 'tcp' | 'tls' };
  /** Esplora API base: `/v1/fees/recommended` and `/tx/<txid>/status` (src/wallet/mutinynet.ts). */
  readonly esploraApi: string;
  /** Block explorer base: `/tx/<txid>` and `/address/<address>`. */
  readonly explorer: string;
  /** A public faucet, if the network has one. */
  readonly faucetUrl: string | undefined;
  /** The Paykit endpoint id for our P2WPKH address (src/config/paykit.ts ENDPOINT_BTC). */
  readonly endpointId: 'btc-mutinynet-p2wpkh' | 'btc-regtest-p2wpkh';
  /** Bech32 human-readable part plus separator: the only addresses this wallet pays. */
  readonly bech32Prefix: 'tb1' | 'bcrt1';
  /** The Bitcoin payment proof this wallet sends (src/paykit/paymentProofs.ts). */
  readonly proofFormat: 'paykit-wdk' | 'bitkit';
  /** WDK's asset id; it keys WDK's balance cache. */
  readonly assetId: 'btc-mutinynet' | 'btc-regtest';
  /** How long until a transaction is in a block, in words. */
  readonly confirmationTime: string;
  /**
   * True when blocks come only when someone mines one (regtest), so the
   * app cannot promise a time for the next one.
   */
  readonly blocksOnDemand: boolean;
};

const MUTINYNET: BtcChainProfile = {
  id: 'mutinynet',
  displayName: 'Mutinynet',
  networkLabel: 'Bitcoin (Mutinynet)',
  networkName: 'Mutinynet test network',
  coinName: 'Mutinynet test bitcoin',
  detailsLabel: 'Bitcoin (Mutinynet signet)',
  // A signet uses testnet address rules (tb1…, m/84'/1').
  wdkNetwork: 'testnet',
  electrum: MUTINYNET_ELECTRUM,
  esploraApi: MUTINYNET_API,
  explorer: MUTINYNET_EXPLORER,
  faucetUrl: MUTINYNET_FAUCET_URL,
  endpointId: 'btc-mutinynet-p2wpkh',
  bech32Prefix: 'tb1',
  proofFormat: 'paykit-wdk',
  assetId: 'btc-mutinynet',
  // Mutinynet makes a block every 30 s.
  confirmationTime: 'about 30 seconds',
  blocksOnDemand: false,
};

const BITKIT_REGTEST: BtcChainProfile = {
  id: 'bitkit-regtest',
  displayName: 'Regtest',
  networkLabel: 'Bitcoin (Bitkit regtest)',
  networkName: 'Bitkit regtest network',
  coinName: 'regtest bitcoin',
  detailsLabel: 'Bitcoin (Bitkit regtest)',
  wdkNetwork: 'regtest',
  electrum: BITKIT_REGTEST_ELECTRUM,
  esploraApi: BITKIT_REGTEST_API,
  explorer: BITKIT_REGTEST_EXPLORER,
  faucetUrl: undefined,
  // Bitkit's own id for this endpoint, so each wallet finds the other's address.
  endpointId: 'btc-regtest-p2wpkh',
  bech32Prefix: 'bcrt1',
  proofFormat: 'bitkit',
  assetId: 'btc-regtest',
  confirmationTime: 'the next block, mined on demand',
  // Blocktank's staging regtest mines when asked (scripts/fund-btc.mjs
  // --mine, or Bitkit's Dev Settings).
  blocksOnDemand: true,
};

/** The profile for an EXPO_PUBLIC_BTC_CHAIN value. Throws for a value it does not know. */
export function btcChainFromEnv(value: string | undefined): BtcChainProfile {
  if (value === undefined || value === '') return MUTINYNET;
  if (value === 'bitkit-regtest') return BITKIT_REGTEST;
  throw new Error(`EXPO_PUBLIC_BTC_CHAIN is "${value}". Leave it unset for Mutinynet, or set it to "bitkit-regtest".`);
}

// Dot access on purpose: Expo only inlines EXPO_PUBLIC_* variables written exactly this way.
export const BTC_CHAIN = btcChainFromEnv(process.env.EXPO_PUBLIC_BTC_CHAIN);
