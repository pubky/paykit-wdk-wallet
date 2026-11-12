// Address checks follow the build's Bitcoin network (src/config/btcChain.ts).
import { checkRecipientAddress, isPayableBtcAddress } from '../addressFormat';
import { withBtcChain } from '../../config/__tests__/withBtcChain';

const TB1 = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const BCRT1 = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

/** Loads the module as a bitkit-regtest build would, then restores the variable. */
function loadOnRegtest(): typeof import('../addressFormat') {
  return withBtcChain('bitkit-regtest', () => jest.requireActual<typeof import('../addressFormat')>('../addressFormat'));
}

describe('Bitcoin addresses on a Mutinynet build', () => {
  it('pays tb1 only, not regtest bcrt1', () => {
    expect(isPayableBtcAddress(TB1)).toBe(true);
    expect(isPayableBtcAddress(BCRT1)).toBe(false);
    expect(checkRecipientAddress(BCRT1, 'bitcoin')).toMatchObject({ ok: false, message: 'This wallet sends to tb1… addresses only. Ask for a tb1… address.' });
  });
});

describe('Bitcoin addresses on a Bitkit regtest build', () => {
  const regtest = loadOnRegtest();

  it('pays bcrt1 only, not Mutinynet tb1', () => {
    expect(regtest.isPayableBtcAddress(BCRT1)).toBe(true);
    expect(regtest.isPayableBtcAddress(BCRT1.toUpperCase())).toBe(true);
    expect(regtest.isPayableBtcAddress(TB1)).toBe(false);
    expect(regtest.chainOfAddress(BCRT1)).toBe('bitcoin');
  });

  it("keeps bech32's 90-character limit with the longer bcrt1 prefix", () => {
    const longest = `bcrt1${'q'.repeat(85)}`;
    expect(longest).toHaveLength(90);
    expect(regtest.isPayableBtcAddress(longest)).toBe(true);
    expect(regtest.isPayableBtcAddress(`${longest}q`)).toBe(false);
  });

  it('accepts a bcrt1 recipient and refuses a tb1 one, naming bcrt1', () => {
    expect(regtest.checkRecipientAddress(`bitcoin:${BCRT1}`, 'bitcoin')).toEqual({ ok: true, address: BCRT1 });
    expect(regtest.checkRecipientAddress(TB1, 'bitcoin')).toEqual({
      ok: false,
      reason: 'unsupported',
      message: 'This wallet sends to bcrt1… addresses only. Ask for a bcrt1… address.',
    });
    expect(regtest.checkRecipientAddress(TB1, 'ethereum')).toMatchObject({ ok: false, reason: 'wrong-chain' });
  });
});
