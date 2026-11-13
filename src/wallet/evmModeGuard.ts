// Which EVM mode (EXPO_PUBLIC_EVM_CHAIN) this device's app state was set
// up under, and the refusal when this build runs another one.
//
// Each EVM mode keeps its seed under its own wallet id (WALLET_ID in
// src/config/wdk.ts), so a seed under this build's id is always this
// mode's. The app's other persisted state (contacts, requests, the payment
// ledger) is not keyed by mode, though: an install restarted with another
// EXPO_PUBLIC_EVM_CHAIN would mix them. So createWallet and restoreWallet
// record the mode (src/wallet/useWalletLifecycle.ts), and a build for
// another mode does not unlock, create or restore.
//
// No native imports: unit tested in Node.
import { EVM_CHAIN_PROFILES, isEvmChainId, type EvmChainId, type EvmChainProfile } from '../config/evmChain';

/** Thrown by unlock, createWallet and restoreWallet when the device belongs to another EVM mode. Its message is safe to show. */
export class WrongEvmModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongEvmModeError';
  }
}

/** "Ethereum Sepolia", "Arbitrum (local fork)"; undefined for a mode this build does not know. */
function networkNameOf(mode: string): string | undefined {
  return isEvmChainId(mode) ? EVM_CHAIN_PROFILES[mode].networkName : undefined;
}

/**
 * The EVM mode this device's app state belongs to, or undefined when that
 * is not known. `recordedMode` is the stored mode, undefined when there is
 * none. `hasSepoliaSeed`: a seed exists under Sepolia's wallet id.
 *
 * Without a record, a Sepolia seed means a Sepolia install: either one
 * from before the record existed, when Sepolia was the only mode, or one
 * whose record an iOS reinstall deleted while the Keychain kept the seed.
 * Anything else is unknown, such as an Arbitrum fork install after an iOS
 * reinstall, whose seed is under its own id.
 */
export function deviceEvmMode(recordedMode: string | undefined, hasSepoliaSeed: boolean): string | undefined {
  if (recordedMode !== undefined) return recordedMode;
  const sepolia: EvmChainId = 'sepolia';
  return hasSepoliaSeed ? sepolia : undefined;
}

/**
 * Why this build must not open the wallet on this device, or undefined
 * when it may: only a known mode (deviceEvmMode) other than the build's is
 * refused. The text is shown as it is.
 */
export function wrongEvmModeMessage(deviceMode: string | undefined, build: EvmChainProfile): string | undefined {
  if (deviceMode === undefined || deviceMode === build.id) return undefined;
  const walletNetwork = networkNameOf(deviceMode);
  const setUpFor = walletNetwork === undefined ? 'another network' : walletNetwork;
  const goBack = walletNetwork === undefined ? 'the build it was set up with' : `a build for ${walletNetwork}`;
  return (
    `This wallet was set up for ${setUpFor}. This build runs ${build.networkName}, so it does not open it. ` +
    'To start fresh on this build, erase the simulator, or uninstall the app on Android. ' +
    'On iOS, deleting the app is not enough: the wallet stays in the Keychain. ' +
    `To use this wallet, open it with ${goBack}.`
  );
}
