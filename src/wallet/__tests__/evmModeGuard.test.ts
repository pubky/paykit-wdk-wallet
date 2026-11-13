import { evmChainFromEnv } from '../../config/evmChain';
import { deviceEvmMode, WrongEvmModeError, wrongEvmModeMessage } from '../evmModeGuard';

const SEPOLIA = evmChainFromEnv(undefined);
const ARBITRUM_FORK = evmChainFromEnv('arbitrum-fork');

describe('deviceEvmMode', () => {
  it('is the recorded mode when there is one', () => {
    expect(deviceEvmMode('arbitrum-fork', true)).toBe('arbitrum-fork');
    expect(deviceEvmMode('sepolia', false)).toBe('sepolia');
  });

  it('is Sepolia with no record but a seed under the Sepolia wallet id', () => {
    expect(deviceEvmMode(undefined, true)).toBe('sepolia');
  });

  it('is unknown with neither a record nor a Sepolia seed', () => {
    expect(deviceEvmMode(undefined, false)).toBeUndefined();
  });
});

describe('opening the wallet on a device', () => {
  /** What a build decides for a device with this record and Sepolia seed. */
  const refusal = (recordedMode: string | undefined, hasSepoliaSeed: boolean, build = ARBITRUM_FORK) =>
    wrongEvmModeMessage(deviceEvmMode(recordedMode, hasSepoliaSeed), build);

  it('opens a Sepolia install from before the record on the Sepolia build, as before', () => {
    expect(refusal(undefined, true, SEPOLIA)).toBeUndefined();
    expect(refusal('sepolia', true, SEPOLIA)).toBeUndefined();
  });

  it('opens an Arbitrum fork install after an iOS reinstall: no record, its seed under its own id', () => {
    expect(refusal(undefined, false)).toBeUndefined();
  });

  it('opens a fresh install of either build', () => {
    expect(refusal(undefined, false, SEPOLIA)).toBeUndefined();
    expect(refusal(undefined, false, ARBITRUM_FORK)).toBeUndefined();
  });

  it('refuses a Sepolia install, recorded or not, on the Arbitrum fork build', () => {
    expect(refusal(undefined, true)).toMatch(/^This wallet was set up for Ethereum Sepolia\. This build runs Arbitrum \(local fork\)/);
    expect(refusal('sepolia', false)).toMatch(/^This wallet was set up for Ethereum Sepolia\./);
  });

  it('refuses an Arbitrum fork install on the Sepolia build', () => {
    expect(refusal('arbitrum-fork', false, SEPOLIA)).toMatch(/^This wallet was set up for Arbitrum \(local fork\)\. This build runs Ethereum Sepolia/);
  });
});

describe('wrongEvmModeMessage', () => {
  it('opens a wallet set up under the build’s own EVM mode', () => {
    expect(wrongEvmModeMessage('sepolia', SEPOLIA)).toBeUndefined();
    expect(wrongEvmModeMessage('arbitrum-fork', ARBITRUM_FORK)).toBeUndefined();
  });

  it('opens a device whose mode is not known', () => {
    expect(wrongEvmModeMessage(undefined, SEPOLIA)).toBeUndefined();
    expect(wrongEvmModeMessage(undefined, ARBITRUM_FORK)).toBeUndefined();
  });

  it('refuses a wallet from any other EVM mode, naming both networks', () => {
    expect(wrongEvmModeMessage('sepolia', ARBITRUM_FORK)).toBe(
      'This wallet was set up for Ethereum Sepolia. This build runs Arbitrum (local fork), so it does not open it. ' +
        'To start fresh on this build, erase the simulator, or uninstall the app on Android. ' +
        'On iOS, deleting the app is not enough: the wallet stays in the Keychain. ' +
        'To use this wallet, open it with a build for Ethereum Sepolia.',
    );
    expect(wrongEvmModeMessage('arbitrum-fork', SEPOLIA)).toMatch(/^This wallet was set up for Arbitrum \(local fork\)\. This build runs Ethereum Sepolia/);
  });

  it('refuses a mode this build does not know, without naming a network for it', () => {
    // 'toString' is not a mode, only a key every object inherits.
    for (const recorded of ['base-sepolia', 'toString']) {
      const message = wrongEvmModeMessage(recorded, SEPOLIA);
      expect(message).toMatch(/^This wallet was set up for another network\. This build runs Ethereum Sepolia/);
      expect(message).toMatch(/open it with the build it was set up with\.$/);
    }
  });
});

describe('WrongEvmModeError', () => {
  it('carries the message and can be told apart from other errors', () => {
    const error = new WrongEvmModeError('set up elsewhere');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(WrongEvmModeError);
    expect(error.message).toBe('set up elsewhere');
    expect(error.name).toBe('WrongEvmModeError');
  });
});
