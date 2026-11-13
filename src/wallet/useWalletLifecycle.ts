// The wallet's lifecycle on top of WDK's React Native hooks: create,
// restore, unlock, and read the mnemonic.
//
// WDK keeps one encrypted seed per wallet id in the Keychain/Keystore and
// runs the wallet in a Bare worklet. This app manages exactly one wallet
// (WALLET_ID). The same BIP-39 mnemonic also derives the Pubky identity for
// Paykit (PaykitService.connect in src/paykit/PaykitService.ts), so "one recovery phrase restores
// both" — testnet only, because the two key uses are not domain-separated.
//
// Each EVM mode has its own wallet id, and the app records the EVM mode
// its state was set up under (./evmModeGuard.ts). A build for another EVM
// mode does not unlock, create or restore, and reports 'wrong-evm-mode'.
//
// Never log or render the mnemonic outside the explicit "reveal" screen.
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { createSecureStorage, useWalletManager, useWdkApp, validateMnemonic } from '@tetherto/wdk-react-native-core';

import { EVM_CHAIN } from '../config/evmChain';
import { SEPOLIA_WALLET_ID, WALLET_ID } from '../config/wdk';
import { appStorage } from '../settings/appSettings';
import { deviceEvmMode, WrongEvmModeError, wrongEvmModeMessage } from './evmModeGuard';

export type WalletStatus =
  /** The WDK worklet is starting (or restarting). */
  | 'starting'
  /** No wallet on this device: onboarding must create or restore one. */
  | 'no-wallet'
  /** A wallet exists but is not loaded into the worklet yet. */
  | 'locked'
  /** Unlocked and ready for balances, addresses and sends. */
  | 'ready'
  /** This device's wallet was set up under another EVM mode; unlock, create or restore refused it. */
  | 'wrong-evm-mode'
  | 'error';

export type WalletLifecycle = {
  status: WalletStatus;
  /**
   * Safe-to-show text when status is 'error', or, for 'wrong-evm-mode',
   * why this build does not open the wallet.
   */
  error?: string;
  /** Throws WrongEvmModeError, as unlock does, when this device belongs to another EVM mode. */
  createWallet: () => Promise<void>;
  /**
   * Restore from a phrase. Deletes any wallet already on the device first,
   * without asking: the caller must confirm (onboarding does). Throws
   * WrongEvmModeError, as unlock does, when this device belongs to another EVM mode.
   */
  restoreWallet: (mnemonic: string) => Promise<void>;
  /** Throws WrongEvmModeError, and the status becomes 'wrong-evm-mode', when this build must not open the wallet. */
  unlock: () => Promise<void>;
  /** The phrase, for deriving the Pubky identity or the reveal screen. Keep it out of state and logs. */
  getMnemonic: () => Promise<string>;
  /** True if `text` looks like a BIP-39 phrase (12 or 24 words; WDK and Paykit verify the checksum). */
  isValidMnemonic: (text: string) => boolean;
  /**
   * True if the Keychain/Keystore holds an encrypted seed for WALLET_ID.
   * WDK's wallet list lives in a separate MMKV file and can be empty while
   * the seed still exists (e.g. after an app data migration), so the launch
   * gate checks the seed itself.
   */
  hasStoredWallet: () => Promise<boolean>;
};

function hasStoredWallet(): Promise<boolean> {
  return createSecureStorage().hasWallet(WALLET_ID);
}

/** The EVM mode (EVM_CHAIN.id) the wallet was created or restored under, in the plain app settings file. */
const WALLET_EVM_MODE = 'wallet-evm-mode-v1';

/** Why this build must not open the wallet on this device, or undefined. */
async function wrongEvmModeOnThisDevice(): Promise<string | undefined> {
  const recordedMode = appStorage.getString(WALLET_EVM_MODE);
  // A Sepolia build opens a Sepolia or unknown device alike, so it skips the Keychain read.
  const hasSepoliaSeed =
    recordedMode === undefined && WALLET_ID !== SEPOLIA_WALLET_ID && (await createSecureStorage().hasWallet(SEPOLIA_WALLET_ID));
  return wrongEvmModeMessage(deviceEvmMode(recordedMode, hasSepoliaSeed), EVM_CHAIN);
}

/**
 * The guard's refusal (unlock, create or restore), shared by every user of
 * the hook. Never cleared: the build's EVM mode does not change while the
 * app runs.
 */
let evmModeRefusal: string | undefined;
const evmModeRefusalListeners = new Set<() => void>();

function refuseWallet(message: string): void {
  evmModeRefusal = message;
  evmModeRefusalListeners.forEach((listener) => listener());
}

function subscribeToEvmModeRefusal(listener: () => void): () => void {
  evmModeRefusalListeners.add(listener);
  return () => evmModeRefusalListeners.delete(listener);
}

function getEvmModeRefusal(): string | undefined {
  return evmModeRefusal;
}

/**
 * Before unlock, create or restore. Create and restore too: after an iOS
 * reinstall a Sepolia seed can outlive the record, and this build would
 * otherwise record its own mode over a Sepolia device.
 */
async function refuseIfWrongEvmMode(): Promise<void> {
  const wrongMode = await wrongEvmModeOnThisDevice();
  if (wrongMode === undefined) return;
  refuseWallet(wrongMode);
  throw new WrongEvmModeError(wrongMode);
}

/**
 * Recorded before WDK holds the new wallet. A create or restore that then
 * fails leaves a record without a wallet; the next one writes it again.
 */
function recordWalletEvmMode(): void {
  appStorage.set(WALLET_EVM_MODE, EVM_CHAIN.id);
}

/** Normalize how people paste phrases: lowercase, single spaces. */
export function normalizeMnemonic(text: string): string {
  return text.trim().toLowerCase().split(/\s+/).join(' ');
}

export function useWalletLifecycle(): WalletLifecycle {
  const { state } = useWdkApp();
  const manager = useWalletManager();

  const wrongEvmMode = useSyncExternalStore(subscribeToEvmModeRefusal, getEvmModeRefusal);

  const status: WalletStatus = (() => {
    if (wrongEvmMode !== undefined) return 'wrong-evm-mode';
    switch (state.status) {
      case 'READY':
        return 'ready';
      case 'NO_WALLET':
        return 'no-wallet';
      case 'LOCKED':
        return 'locked';
      case 'ERROR':
        return 'error';
      default:
        return 'starting';
    }
  })();

  const createWallet = useCallback(async () => {
    await refuseIfWrongEvmMode();
    recordWalletEvmMode();
    await manager.createWallet(WALLET_ID);
  }, [manager]);

  const restoreWallet = useCallback(
    async (mnemonic: string) => {
      const phrase = normalizeMnemonic(mnemonic);
      if (!validateMnemonic(phrase)) throw new Error('A recovery phrase has 12 or 24 words.');
      await refuseIfWrongEvmMode();
      recordWalletEvmMode();
      // Onboarding only, after the person confirmed: the wallet already on
      // the device (an unfinished onboarding, or one an earlier install left
      // in the Keychain) is deleted. WDK refuses to restore over an existing
      // id otherwise.
      if (manager.status === 'UNLOCKED') await manager.lock();
      if (await hasStoredWallet()) await manager.deleteWallet(WALLET_ID);
      await manager.restoreWallet(phrase, WALLET_ID);
    },
    [manager],
  );

  const unlock = useCallback(async () => {
    await refuseIfWrongEvmMode();
    await manager.unlock(WALLET_ID);
  }, [manager]);

  const getMnemonic = useCallback(async () => {
    const phrase = await manager.getMnemonic(WALLET_ID);
    if (!phrase) throw new Error('No recovery phrase stored for this wallet');
    return phrase;
  }, [manager]);

  const isValidMnemonic = useCallback((text: string) => validateMnemonic(normalizeMnemonic(text)), []);

  return useMemo(
    () => ({
      status,
      error: wrongEvmMode ?? (state.status === 'ERROR' ? state.error.message : undefined),
      createWallet,
      restoreWallet,
      unlock,
      getMnemonic,
      isValidMnemonic,
      hasStoredWallet,
    }),
    [status, state, wrongEvmMode, createWallet, restoreWallet, unlock, getMnemonic, isValidMnemonic],
  );
}
