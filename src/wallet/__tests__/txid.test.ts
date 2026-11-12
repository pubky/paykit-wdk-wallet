import { isLowercaseTxid, isTxid } from '../txid';

const TXID = 'ab'.repeat(32);

describe('txid checks', () => {
  it('accepts 64 hex characters in either case for lookups', () => {
    expect(isTxid(TXID)).toBe(true);
    expect(isTxid(TXID.toUpperCase())).toBe(true);
  });

  it('accepts lowercase only for proofs', () => {
    expect(isLowercaseTxid(TXID)).toBe(true);
    expect(isLowercaseTxid(TXID.toUpperCase())).toBe(false);
  });

  it('refuses anything that is not a 64-character hex string', () => {
    for (const bad of [TXID.slice(1), `${TXID}a`, `${TXID.slice(1)}g`, ` ${TXID}`, '', 7, undefined, null]) {
      expect(isTxid(bad)).toBe(false);
      expect(isLowercaseTxid(bad)).toBe(false);
    }
  });
});
