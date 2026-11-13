// Which demo identity a dev build prefills, by platform and chain modes.
//
// The real demo.local.ts holds secrets and is git-ignored: replace it with
// an empty stand-in so this test never loads it, present or not (jest
// hoists jest.mock above the import).
import { choosePrefill, type DemoLocal } from '../demo';

jest.mock('../demo.local', () => ({ default: {} }), { virtual: true });

const local: DemoLocal = {
  ios: { mnemonic: 'ios phrase' },
  android: { mnemonic: 'android phrase' },
  bitkitRegtest: { mnemonic: 'regtest phrase' },
};

describe('choosePrefill', () => {
  it('keeps the Sepolia behaviour: one identity per platform, the regtest one on iOS only', () => {
    expect(choosePrefill(local, 'ios', 'mutinynet', 'sepolia')).toBe(local.ios);
    expect(choosePrefill(local, 'android', 'mutinynet', 'sepolia')).toBe(local.android);
    expect(choosePrefill(local, 'web', 'mutinynet', 'sepolia')).toBeUndefined();
    expect(choosePrefill(local, 'ios', 'bitkit-regtest', 'sepolia')).toBe(local.bitkitRegtest);
    expect(choosePrefill(local, 'android', 'bitkit-regtest', 'sepolia')).toBeUndefined();
  });

  it('prefills nothing on the Arbitrum modes: the demo identities run on Sepolia', () => {
    for (const evm of ['arbitrum-fork', 'arbitrum-one'] as const) {
      for (const btc of ['mutinynet', 'bitkit-regtest'] as const) {
        for (const os of ['ios', 'android']) expect(choosePrefill(local, os, btc, evm)).toBeUndefined();
      }
    }
  });
});
