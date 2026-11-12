import { BTC_CHAIN, btcChainFromEnv } from '../btcChain';
import { MUTINYNET_API, MUTINYNET_ELECTRUM, MUTINYNET_FAUCET_URL } from '../chains';

describe('btcChainFromEnv', () => {
  it('runs on Mutinynet when the variable is unset or empty', () => {
    for (const value of [undefined, '']) {
      expect(btcChainFromEnv(value)).toMatchObject({ id: 'mutinynet', wdkNetwork: 'testnet', bech32Prefix: 'tb1', proofFormat: 'paykit-wdk' });
    }
    expect(btcChainFromEnv(undefined)).toMatchObject({
      electrum: MUTINYNET_ELECTRUM,
      esploraApi: MUTINYNET_API,
      endpointId: 'btc-mutinynet-p2wpkh',
      funding: { kind: 'faucet', url: MUTINYNET_FAUCET_URL },
      ownProofNetwork: 'mutinynet',
      confirmsIn: 'about 30 seconds',
      pendingUntil: 'the next Mutinynet block, in about 30 seconds',
    });
  });

  it("runs on Bitkit's staging regtest for 'bitkit-regtest'", () => {
    expect(btcChainFromEnv('bitkit-regtest')).toMatchObject({
      id: 'bitkit-regtest',
      wdkNetwork: 'regtest',
      electrum: { host: 'electrs.bitkit.stag0.blocktank.to', port: 9999, protocol: 'tls' },
      esploraApi: 'https://mempool.bitkit.stag0.blocktank.to/api',
      funding: { kind: 'blocktank-regtest' },
      confirmsIn: 'the next block, which comes only when someone mines one',
      pendingUntil: 'the next block, which comes only when someone mines one',
      ownProofNetwork: undefined,
      endpointId: 'btc-regtest-p2wpkh',
      bech32Prefix: 'bcrt1',
      proofFormat: 'bitkit',
      assetId: 'btc-regtest',
    });
  });

  it('refuses any other value instead of guessing a network', () => {
    for (const value of ['regtest', 'mainnet', 'Bitkit-Regtest', ' bitkit-regtest']) {
      expect(() => btcChainFromEnv(value)).toThrow('EXPO_PUBLIC_BTC_CHAIN');
    }
  });

  it('is Mutinynet in this test run (the variable is unset)', () => {
    expect(BTC_CHAIN.id).toBe('mutinynet');
  });
});
