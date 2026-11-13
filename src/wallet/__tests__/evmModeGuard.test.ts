import { evmChainFromEnv } from '../../config/evmChain';
import { UNRECORDED_EVM_MODE, WrongEvmModeError, wrongEvmModeMessage } from '../evmModeGuard';

const SEPOLIA = evmChainFromEnv(undefined);
const ARBITRUM_FORK = evmChainFromEnv('arbitrum-fork');
const ARBITRUM_ONE = evmChainFromEnv('arbitrum-one');

describe('wrongEvmModeMessage', () => {
  it('opens a wallet set up under the build’s own EVM mode', () => {
    expect(wrongEvmModeMessage('sepolia', SEPOLIA)).toBeUndefined();
    expect(wrongEvmModeMessage('arbitrum-fork', ARBITRUM_FORK)).toBeUndefined();
    expect(wrongEvmModeMessage('arbitrum-one', ARBITRUM_ONE)).toBeUndefined();
  });

  it('counts a wallet with no record as Sepolia, so installs from before the record keep working', () => {
    expect(UNRECORDED_EVM_MODE).toBe('sepolia');
    expect(wrongEvmModeMessage(undefined, SEPOLIA)).toBeUndefined();
  });

  it('refuses a wallet with no record on an Arbitrum build', () => {
    expect(wrongEvmModeMessage(undefined, ARBITRUM_ONE)).toMatch(
      /^This wallet was set up for Ethereum Sepolia\. This build runs Arbitrum One, so it does not open it\./,
    );
    expect(wrongEvmModeMessage(undefined, ARBITRUM_FORK)).toMatch(/^This wallet was set up for Ethereum Sepolia\. This build runs Arbitrum \(local fork\)/);
  });

  it('refuses a wallet from any other EVM mode, naming both networks', () => {
    expect(wrongEvmModeMessage('sepolia', ARBITRUM_ONE)).toBe(
      'This wallet was set up for Ethereum Sepolia. This build runs Arbitrum One, so it does not open it. ' +
        'To start fresh on this build, erase the simulator, or uninstall the app on Android. ' +
        'On iOS, deleting the app is not enough: the wallet stays in the Keychain. ' +
        'To use this wallet, open it with a build for Ethereum Sepolia.',
    );
    expect(wrongEvmModeMessage('arbitrum-fork', SEPOLIA)).toMatch(/^This wallet was set up for Arbitrum \(local fork\)\. This build runs Ethereum Sepolia/);
    expect(wrongEvmModeMessage('arbitrum-fork', ARBITRUM_ONE)).toMatch(/set up for Arbitrum \(local fork\)\. This build runs Arbitrum One/);
    expect(wrongEvmModeMessage('arbitrum-one', ARBITRUM_FORK)).toMatch(/set up for Arbitrum One\. This build runs Arbitrum \(local fork\)/);
  });

  it('refuses a mode this build does not know, without naming a network for it', () => {
    const message = wrongEvmModeMessage('base-sepolia', SEPOLIA);
    expect(message).toMatch(/^This wallet was set up for another network\. This build runs Ethereum Sepolia/);
    expect(message).toMatch(/open it with the build it was set up with\.$/);
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
