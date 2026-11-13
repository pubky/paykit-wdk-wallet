// WDK runtime configuration: which networks the wallet talks to.
//
// The network keys ('bitcoin', 'ethereum') must match `networks` in
// wdk.config.js, which decides which wallet modules go into the worklet
// bundle. Chain constants live in ./chains.ts. The Bitcoin network
// (Mutinynet or Bitkit's regtest) is picked at build time in ./btcChain.ts,
// and the EVM chain (Sepolia, a local Arbitrum fork or Arbitrum One) in
// ./evmChain.ts. The 'ethereum' key names WDK's EVM module, whichever EVM
// chain that is.
import { BaseAsset, type WdkConfigs } from '@tetherto/wdk-react-native-core';

import { BTC_CHAIN } from './btcChain';
import { EVM_CHAIN } from './evmChain';

export const BTC_NETWORK = 'bitcoin';
export const EVM_NETWORK = 'ethereum';

/**
 * The one WDK wallet (seed) this app manages. WDK stores the encrypted seed
 * in the Keychain/Keystore under this id. Do not change it: existing installs
 * would no longer find their wallet.
 */
export const WALLET_ID = 'paykit-wdk-demo';

/**
 * Electrum reconnects. WDK's Bitcoin client (@mempool/electrum-client)
 * reopens its socket after a close, but by default only twice per session
 * (`maxRetry: 2`), and every close counts, including one while the app was
 * in the background. After that every Bitcoin read fails with "Connection
 * to server lost" until the app restarts. This keeps reconnecting, a second
 * after each close, for as long as the app runs. Reads also retry once
 * quietly (src/wallet/electrumRetry.ts).
 */
const ELECTRUM_RECONNECT = { maxRetry: 100_000, retryPeriod: 1_000 } as const;

export const wdkConfigs: WdkConfigs = {
  networks: {
    [BTC_NETWORK]: {
      blockchain: BTC_NETWORK,
      config: {
        // WDK's BTC module only knows 'bitcoin' | 'testnet' | 'regtest'.
        // Signets use testnet address rules (tb1..., m/84'/1'), so Mutinynet
        // is 'testnet'; Bitkit's regtest is 'regtest' (bcrt1..., m/84'/1').
        network: BTC_CHAIN.wdkNetwork,
        bip: 84,
        client: { type: 'electrum', clientConfig: { ...BTC_CHAIN.electrum, ...ELECTRUM_RECONNECT } },
      },
    },
    [EVM_NETWORK]: {
      blockchain: EVM_NETWORK,
      config: {
        provider: EVM_CHAIN.rpc,
        chainId: EVM_CHAIN.chainId,
      },
    },
  },
};

/** WDK asset descriptors. `id` values are local to WDK's balance cache. */
export const BTC = new BaseAsset({
  id: BTC_CHAIN.assetId,
  network: BTC_NETWORK,
  symbol: 'BTC',
  name: BTC_CHAIN.networkLabel,
  decimals: 8,
  isNative: true,
  address: null,
});

export const ETH = new BaseAsset({
  id: EVM_CHAIN.ethAssetId,
  network: EVM_NETWORK,
  symbol: 'ETH',
  name: EVM_CHAIN.ethAssetName,
  decimals: 18,
  isNative: true,
  address: null,
});

export const USDT = new BaseAsset({
  id: EVM_CHAIN.usdtAssetId,
  network: EVM_NETWORK,
  symbol: 'USDT',
  name: EVM_CHAIN.usdtAssetName,
  decimals: 6,
  isNative: false,
  address: EVM_CHAIN.usdtToken,
});
