// Which EVM mode (EXPO_PUBLIC_EVM_CHAIN) the wallet on this device was set
// up under, and the refusal when this build runs another one.
//
// Every EVM mode uses the same wallet id (WALLET_ID in src/config/wdk.ts).
// Without a record, an install restarted with another EXPO_PUBLIC_EVM_CHAIN
// opens the same wallet there: a Sepolia wallet, perhaps restored from a
// demo phrase that sits in a plain file, shows its address on Arbitrum One,
// with real money; or a shared identity moves its published USD₮ endpoint
// to the local fork. So createWallet and restoreWallet record the mode
// (src/wallet/useWalletLifecycle.ts), and a build for another mode does not
// unlock the wallet.
//
// A wallet with no record was set up before the record existed, when
// Sepolia was the only mode, so it counts as Sepolia: those installs keep
// working on the default build.
//
// No native imports: unit tested in Node.
import { evmChainFromEnv, type EvmChainId, type EvmChainProfile } from '../config/evmChain';

const EVM_MODES: readonly string[] = ['sepolia', 'arbitrum-fork', 'arbitrum-one'] satisfies readonly EvmChainId[];

/** The mode of a wallet with no record: the only mode there was before the record. */
export const UNRECORDED_EVM_MODE: EvmChainId = 'sepolia';

/** Thrown by unlock when the wallet was set up under another EVM mode. Its message is safe to show. */
export class WrongEvmModeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WrongEvmModeError';
  }
}

/** "Ethereum Sepolia", "Arbitrum (local fork)", "Arbitrum One"; undefined for a mode this build does not know. */
function networkNameOf(mode: string): string | undefined {
  if (!EVM_MODES.includes(mode)) return undefined;
  // evmChainFromEnv reads Sepolia as "unset".
  return evmChainFromEnv(mode === 'sepolia' ? undefined : mode).networkName;
}

/**
 * Why this build must not open the wallet on this device, or undefined
 * when it may. `recordedMode` is the stored mode, undefined when there is
 * none. The text is shown as it is.
 */
export function wrongEvmModeMessage(recordedMode: string | undefined, build: EvmChainProfile): string | undefined {
  const walletMode = recordedMode ?? UNRECORDED_EVM_MODE;
  if (walletMode === build.id) return undefined;
  const walletNetwork = networkNameOf(walletMode);
  const setUpFor = walletNetwork === undefined ? 'another network' : walletNetwork;
  const goBack = walletNetwork === undefined ? 'the build it was set up with' : `a build for ${walletNetwork}`;
  return (
    `This wallet was set up for ${setUpFor}. This build runs ${build.networkName}, so it does not open it. ` +
    'To start fresh on this build, erase the simulator, or uninstall the app on Android. ' +
    'On iOS, deleting the app is not enough: the wallet stays in the Keychain. ' +
    `To use this wallet, open it with ${goBack}.`
  );
}
