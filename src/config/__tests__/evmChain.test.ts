import {
  ARBITRUM_FORK_RPC,
  SEPOLIA_BLOCKSCOUT_API,
  SEPOLIA_ETH_FAUCET_URL,
  SEPOLIA_EXPLORER,
  SEPOLIA_RPC,
} from '../chains';
import { AAVE_FAUCET_FUNDING, EVM_CHAIN, evmChainFromEnv } from '../evmChain';
import { withEvmChain } from './withEnv';

// USD₮0 on Arbitrum One, in lowercase, exactly as Bitkit publishes it.
const USDT0 = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';

describe('evmChainFromEnv', () => {
  it('runs on Sepolia, exactly as before, when the variable is unset or empty', () => {
    for (const value of [undefined, '']) {
      expect(evmChainFromEnv(value)).toEqual({
        id: 'sepolia',
        chainId: 11155111,
        rpc: SEPOLIA_RPC,
        // Checksum form: it goes into the published endpoint payload as written.
        usdtToken: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
        explorer: SEPOLIA_EXPLORER,
        activityApi: SEPOLIA_BLOCKSCOUT_API,
        endpointId: 'usdt-sepolia-address',
        funding: { kind: 'aave-faucet', ethFaucetUrl: SEPOLIA_ETH_FAUCET_URL, testNetwork: 'Sepolia' },
        paymentTime: 'slot-bound',
        buildSwitch: undefined,
        // These key WDK's balance cache: changing them would orphan existing installs' balances.
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
      });
    }
  });

  it("runs on a local Arbitrum fork for 'arbitrum-fork'", () => {
    expect(evmChainFromEnv('arbitrum-fork')).toMatchObject({
      id: 'arbitrum-fork',
      chainId: 42161,
      rpc: ARBITRUM_FORK_RPC,
      usdtToken: USDT0,
      explorer: undefined,
      activityApi: undefined,
      endpointId: 'usdt-arbitrum-address',
      funding: { kind: 'anvil-fork' },
      paymentTime: 'block-timestamp',
      buildSwitch: 'EXPO_PUBLIC_EVM_CHAIN=arbitrum-fork',
      ethAssetId: 'eth-arbitrum-fork',
      usdtAssetId: 'usdt-arbitrum-fork',
      networkLabel: 'Arbitrum (local fork)',
    });
  });

  it("keeps the fork's balances apart from Sepolia's in WDK's cache", () => {
    const ids = (['', 'arbitrum-fork'] as const).flatMap((value) => {
      const profile = evmChainFromEnv(value);
      return [profile.ethAssetId, profile.usdtAssetId];
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never names Sepolia in the Arbitrum fork profile', () => {
    expect(JSON.stringify(evmChainFromEnv('arbitrum-fork'))).not.toMatch(/sepolia/i);
  });

  it('refuses any other value instead of guessing a network', () => {
    for (const value of ['arbitrum', 'mainnet', 'Arbitrum-Fork', ' arbitrum-fork', 'sepolia', 'toString', '__proto__']) {
      expect(() => evmChainFromEnv(value)).toThrow('EXPO_PUBLIC_EVM_CHAIN');
    }
  });

  it("refuses 'arbitrum-one': real funds are not part of this wallet yet", () => {
    expect(() => evmChainFromEnv('arbitrum-one')).toThrow(
      'EXPO_PUBLIC_EVM_CHAIN is "arbitrum-one". Leave it unset for Sepolia, or set it to "arbitrum-fork".',
    );
  });

  it('returns each profile under its own id', () => {
    expect(evmChainFromEnv(undefined).id).toBe('sepolia');
    expect(evmChainFromEnv('arbitrum-fork').id).toBe('arbitrum-fork');
  });

  it('is Sepolia in this test run (the variable is unset)', () => {
    expect(EVM_CHAIN.id).toBe('sepolia');
  });
});

describe('AAVE_FAUCET_FUNDING', () => {
  const load = () => jest.requireActual<typeof import('../evmChain')>('../evmChain').AAVE_FAUCET_FUNDING;

  it("is Sepolia's faucet on the default build", () => {
    expect(AAVE_FAUCET_FUNDING).toEqual({ kind: 'aave-faucet', ethFaucetUrl: SEPOLIA_ETH_FAUCET_URL, testNetwork: 'Sepolia' });
  });

  it('is unset on the Arbitrum fork build, so no screen offers a test-token mint there', () => {
    expect(withEvmChain('arbitrum-fork', load)).toBeUndefined();
  });
});

describe('Paykit USD₮ endpoint id', () => {
  it('follows the build', () => {
    const load = () => jest.requireActual<typeof import('../paykit')>('../paykit').ENDPOINT_USDT;
    expect(load()).toBe('usdt-sepolia-address');
    expect(withEvmChain('arbitrum-fork', load)).toBe('usdt-arbitrum-address');
  });

  it('puts the variable back after loading another build', () => {
    withEvmChain('arbitrum-fork', () => undefined);
    expect(process.env.EXPO_PUBLIC_EVM_CHAIN).toBeUndefined();
  });
});
