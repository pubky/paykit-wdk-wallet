// Paykit and Pubky identifiers. These are frozen: Pubky grants are bound to
// the client id, and peers find our endpoints under the Paykit app id.
import { BTC_CHAIN } from './btcChain';
import { EVM_CHAIN } from './evmChain';

/** Pubky staging homeserver (homeserver.staging.pubky.app). Signup needs a code. */
export const STAGING_HOMESERVER = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';

/** Pubky grant client id. Never change it once grants exist. */
export const PUBKY_CLIENT_ID = 'com.jasonvdb.paykitwdkwallet';

/** Paykit app id that our payment endpoints are published under. */
export const PAYKIT_APP_ID = 'wdk-paykit-demo';
export const PAYKIT_APP_NAME = 'Paykit WDK example wallet';

/**
 * Payment endpoint identifiers. They name the network on purpose, so no
 * real wallet mistakes a testnet address for a mainnet endpoint. Both follow
 * the build's networks. Bitcoin (./btcChain.ts): 'btc-mutinynet-p2wpkh', or
 * Bitkit's own 'btc-regtest-p2wpkh' on Bitkit's regtest. USD₮
 * (./evmChain.ts): 'usdt-sepolia-address', or Bitkit's own
 * 'usdt-arbitrum-address' on the Arbitrum fork.
 */
export const ENDPOINT_BTC = BTC_CHAIN.endpointId;
export const ENDPOINT_USDT = EVM_CHAIN.endpointId;

/** Endpoints we can pay to, in order of preference. */
export const SUPPORTED_ENDPOINTS = [ENDPOINT_USDT, ENDPOINT_BTC] as const;
