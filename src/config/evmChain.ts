// Which EVM chain the wallet's ETH and USD₮ run on, chosen at build time.
//
// Default (EXPO_PUBLIC_EVM_CHAIN unset or empty): Ethereum Sepolia with
// Aave's test USDT, as always.
// EXPO_PUBLIC_EVM_CHAIN=arbitrum-fork: a local Anvil fork of Arbitrum One
// on this computer, with USD₮0 (the token Bitkit's USD₮ uses), so this
// wallet and Bitkit can pay each other USD₮ through Paykit in a demo.
// EXPO_PUBLIC_EVM_CHAIN=arbitrum-one: Arbitrum One itself. Real money.
// Any other value stops the app at launch: silently picking a network is
// how money goes to the wrong place.
//
// The profile holds everything that differs between them: the chain id,
// RPC, token, explorer and history API, the Paykit endpoint id, where test
// funds come from, the rule for when a USD₮ payment was made, WDK's asset
// ids, and the words the screens use for the network.
//
// Expo inlines EXPO_PUBLIC_* variables into the JS bundle. To switch
// chains, restart Metro with the new value (Debug), or rebuild the app
// (Release, where the bundle is inside the app).
//
// No native imports: unit tested in Node, like ./chains.ts.
import {
  ARBISCAN_EXPLORER,
  ARBITRUM_FORK_RPC,
  ARBITRUM_ONE_CHAIN_ID,
  ARBITRUM_ONE_RPC,
  ARBITRUM_USDT0,
  SEPOLIA_BLOCKSCOUT_API,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_ETH_FAUCET_URL,
  SEPOLIA_EXPLORER,
  SEPOLIA_RPC,
  SEPOLIA_USDT,
} from './chains';

export type EvmChainId = 'sepolia' | 'arbitrum-fork' | 'arbitrum-one';

/**
 * The Paykit endpoint ids for our USD₮ address, one per token.
 * 'usdt-arbitrum-address' is Bitkit's own id, so each wallet finds the
 * other's address.
 */
export type UsdtEndpointId = 'usdt-sepolia-address' | 'usdt-arbitrum-address';

/**
 * Where ETH for gas and USD₮ come from (You > Test funds): a public ETH
 * faucet plus Aave's test-token mint (Sepolia), scripts/fund-fork.mjs
 * against the local Anvil fork, or nowhere, because they are real funds.
 * Only 'aave-faucet' shows "Get test USD₮"; `testNetwork` names the network
 * in its words ("Aave’s Sepolia faucet").
 */
export type EvmFunding =
  | { readonly kind: 'aave-faucet'; readonly ethFaucetUrl: string; readonly testNetwork: string }
  | { readonly kind: 'anvil-fork' }
  | { readonly kind: 'real-funds' };

/**
 * How the payee decides when a USD₮ payment was made, to refuse one from
 * before the request (src/paykit/paymentProofs.ts).
 *
 * 'slot-bound': at most one block per slot, so n confirmations mean the
 * transaction was mined at least (n-1) slots ago. Holds on Sepolia only.
 * 'block-timestamp': the block's own timestamp, read from the RPC, with
 * `allowanceMs` for the sequencer's and the phones' clocks. Arbitrum makes
 * several blocks a second, and an Anvil fork mines on demand, so counting
 * confirmations says nothing about time there.
 */
export type EvmPaymentTime =
  | { readonly kind: 'slot-bound'; readonly slotMs: number }
  | { readonly kind: 'block-timestamp'; readonly allowanceMs: number };

export type EvmChainProfile = {
  readonly id: EvmChainId;
  /** The EIP-155 chain id: WDK's chain, the endpoint payload and the proof's EIP-712 domain. */
  readonly chainId: number;
  /** JSON-RPC URL that WDK, and the payment checks, read and send through. */
  readonly rpc: string;
  /**
   * The USD₮ token contract. It goes into the published endpoint payload
   * as written: Sepolia's in checksum form (unchanged), Arbitrum's in
   * lowercase, exactly as Bitkit publishes it.
   */
  readonly usdtToken: string;
  /** Block explorer base (`/tx/<hash>`, `/address/<address>`); none on the local fork. */
  readonly explorer: string | undefined;
  /** Blockscout v2 API base for Activity history; none where no indexer is known. */
  readonly activityApi: string | undefined;
  /** The Paykit endpoint id for our USD₮ address (src/config/paykit.ts ENDPOINT_USDT). */
  readonly endpointId: UsdtEndpointId;
  readonly funding: EvmFunding;
  readonly paymentTime: EvmPaymentTime;
  /** True when ETH and USD₮ are real money: the screens warn about it. */
  readonly realFunds: boolean;
  /** What the Wallet tab and the Send review say, always, on a real-funds build; none otherwise. */
  readonly realFundsWarning: string | undefined;
  /** The build-time switch that picked this chain, shown in Network details; none for the default. */
  readonly buildSwitch: string | undefined;
  /** WDK's asset ids; they key WDK's balance cache, so each chain has its own. */
  readonly ethAssetId: string;
  readonly usdtAssetId: string;
  /** WDK's asset names. */
  readonly ethAssetName: string;
  readonly usdtAssetName: string;
  /** The asset's network, as Activity shows it: "Ethereum (Sepolia)". */
  readonly networkLabel: string;
  /** The network in a sentence: "USD₮ on Ethereum Sepolia", "Ethereum Sepolia. Confirms in …". */
  readonly networkName: string;
  /** The network on the Receive card: "Ethereum Sepolia test network". */
  readonly receiveNetwork: string;
  /** The note under the USD₮ address on the Receive card. */
  readonly receiveNote: string;
  /** The coin that pays gas, in a sentence: "Paid in Sepolia ETH". */
  readonly gasCoin: string;
  /**
   * When a transaction is in a block, after "Confirms in": "about 12
   * seconds". Read through src/wallet/assets.ts CONFIRMATION_TIME.
   */
  readonly confirmsIn: string;
  /**
   * The same, after "It shows as pending in Activity until" on the Send
   * success screen: "the next Sepolia block, in about 12 seconds".
   */
  readonly pendingUntil: string;
  /** The hint under the Send screen's Ethereum address field. */
  readonly addressHint: string;
  /** Why a scanned ethereum: code for another chain or token is refused. */
  readonly wrongChainMessage: string;
  /** For You > Network details, before "(chain id …)": the network and what kind it is. */
  readonly detailsLabel: string;
  /** For You > Network details: the label of the USD₮ token row. */
  readonly tokenLabel: string;
};

const SEPOLIA: EvmChainProfile = {
  id: 'sepolia',
  chainId: SEPOLIA_CHAIN_ID,
  rpc: SEPOLIA_RPC,
  usdtToken: SEPOLIA_USDT,
  explorer: SEPOLIA_EXPLORER,
  activityApi: SEPOLIA_BLOCKSCOUT_API,
  endpointId: 'usdt-sepolia-address',
  funding: { kind: 'aave-faucet', ethFaucetUrl: SEPOLIA_ETH_FAUCET_URL, testNetwork: 'Sepolia' },
  // Sepolia makes at most one block per 12 s slot.
  paymentTime: { kind: 'slot-bound', slotMs: 12_000 },
  realFunds: false,
  realFundsWarning: undefined,
  buildSwitch: undefined,
  ethAssetId: 'eth-sepolia',
  usdtAssetId: 'usdt-sepolia',
  ethAssetName: 'Ether (Sepolia)',
  usdtAssetName: 'Tether USD (Sepolia, Aave test token)',
  networkLabel: 'Ethereum (Sepolia)',
  networkName: 'Ethereum Sepolia',
  receiveNetwork: 'Ethereum Sepolia test network',
  receiveNote: 'Sepolia ETH for gas arrives at this same address. Send only Sepolia test tokens here.',
  gasCoin: 'Sepolia ETH',
  confirmsIn: 'about 12 seconds',
  pendingUntil: 'the next Sepolia block, in about 12 seconds',
  addressHint: 'Any Ethereum address. The tokens move on Sepolia.',
  wrongChainMessage: 'That code is for another Ethereum network. This wallet pays on Sepolia only.',
  detailsLabel: 'Ethereum Sepolia',
  tokenLabel: 'USD₮ token (Aave test USDT)',
};

/**
 * The rule for both Arbitrum profiles: the block's timestamp, give or take
 * 10 minutes (the same allowance as Bitcoin's block time).
 */
const ARBITRUM_PAYMENT_TIME: EvmPaymentTime = { kind: 'block-timestamp', allowanceMs: 10 * 60_000 };

const ARBITRUM_FORK: EvmChainProfile = {
  id: 'arbitrum-fork',
  // A fork keeps Arbitrum One's chain id and token, so Bitkit's payloads and proofs match as they are.
  chainId: ARBITRUM_ONE_CHAIN_ID,
  rpc: ARBITRUM_FORK_RPC,
  usdtToken: ARBITRUM_USDT0,
  explorer: undefined,
  activityApi: undefined,
  endpointId: 'usdt-arbitrum-address',
  funding: { kind: 'anvil-fork' },
  paymentTime: ARBITRUM_PAYMENT_TIME,
  realFunds: false,
  realFundsWarning: undefined,
  buildSwitch: 'EXPO_PUBLIC_EVM_CHAIN=arbitrum-fork',
  // Not Arbitrum One's ids: the fork's balances must never land in the real chain's cache entry.
  ethAssetId: 'eth-arbitrum-fork',
  usdtAssetId: 'usdt-arbitrum-fork',
  ethAssetName: 'Ether (Arbitrum local fork)',
  usdtAssetName: 'Tether USD (USD₮0, Arbitrum local fork)',
  networkLabel: 'Arbitrum (local fork)',
  networkName: 'Arbitrum (local fork)',
  receiveNetwork: 'Local Arbitrum test fork',
  receiveNote: 'ETH for gas arrives at this same address. Only the local fork’s test balances land here.',
  gasCoin: 'ETH on the local fork',
  // Anvil mines each transaction as it arrives.
  confirmsIn: 'a few seconds',
  pendingUntil: 'the next fork block, in a few seconds',
  addressHint: 'Any Ethereum address. The tokens move on the local Arbitrum fork.',
  wrongChainMessage: 'That code is for another Ethereum network. This wallet pays on Arbitrum only.',
  detailsLabel: 'Arbitrum (local Anvil fork of Arbitrum One)',
  tokenLabel: 'USD₮ token (USD₮0, forked)',
};

const ARBITRUM_ONE: EvmChainProfile = {
  id: 'arbitrum-one',
  chainId: ARBITRUM_ONE_CHAIN_ID,
  rpc: ARBITRUM_ONE_RPC,
  usdtToken: ARBITRUM_USDT0,
  explorer: ARBISCAN_EXPLORER,
  // No Blockscout API for Arbitrum One has been checked yet.
  activityApi: undefined,
  endpointId: 'usdt-arbitrum-address',
  funding: { kind: 'real-funds' },
  paymentTime: ARBITRUM_PAYMENT_TIME,
  realFunds: true,
  realFundsWarning: 'Arbitrum One: real USD₮ and ETH. This demo wallet stores keys with demo-grade protection.',
  buildSwitch: 'EXPO_PUBLIC_EVM_CHAIN=arbitrum-one',
  ethAssetId: 'eth-arbitrum-one',
  usdtAssetId: 'usdt-arbitrum-one',
  ethAssetName: 'Ether (Arbitrum One)',
  usdtAssetName: 'Tether USD (USD₮0, Arbitrum One)',
  networkLabel: 'Arbitrum One',
  networkName: 'Arbitrum One',
  receiveNetwork: 'Arbitrum One (real money)',
  receiveNote: 'ETH for gas arrives at this same address. Send only USD₮0 on Arbitrum One here.',
  gasCoin: 'Arbitrum ETH',
  // Arbitrum makes several blocks a second.
  confirmsIn: 'a few seconds',
  pendingUntil: 'the next Arbitrum block, in a few seconds',
  addressHint: 'Any Ethereum address. The tokens move on Arbitrum One, as real USD₮0.',
  wrongChainMessage: 'That code is for another Ethereum network. This wallet pays on Arbitrum One only.',
  detailsLabel: 'Arbitrum One',
  tokenLabel: 'USD₮ token (USD₮0)',
};

/** The profile for an EXPO_PUBLIC_EVM_CHAIN value. Throws for a value it does not know. */
export function evmChainFromEnv(value: string | undefined): EvmChainProfile {
  if (value === undefined || value === '') return SEPOLIA;
  if (value === 'arbitrum-fork') return ARBITRUM_FORK;
  if (value === 'arbitrum-one') return ARBITRUM_ONE;
  throw new Error(`EXPO_PUBLIC_EVM_CHAIN is "${value}". Leave it unset for Sepolia, or set it to "arbitrum-fork" or "arbitrum-one".`);
}

// Dot access on purpose: Expo only inlines EXPO_PUBLIC_* variables written exactly this way.
export const EVM_CHAIN = evmChainFromEnv(process.env.EXPO_PUBLIC_EVM_CHAIN);

/**
 * Aave's test-token faucet, on a build whose USD₮ comes from it (Sepolia);
 * undefined on any other. Screens show "Get test USD₮" and call a mint a
 * mint only when it is set.
 */
export const AAVE_FAUCET_FUNDING = EVM_CHAIN.funding.kind === 'aave-faucet' ? EVM_CHAIN.funding : undefined;
