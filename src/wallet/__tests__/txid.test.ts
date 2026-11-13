import { isEvmHash32, isLowercaseEvmHash32, isLowercaseTxid, isTxid } from '../txid';

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

describe('EVM 32-byte hash checks', () => {
  const HASH = `0x${'ab'.repeat(32)}`;

  it('accepts hex digits in either case after a lowercase 0x for block hashes', () => {
    expect(isEvmHash32(HASH)).toBe(true);
    expect(isEvmHash32(`0x${'AB'.repeat(32)}`)).toBe(true);
    expect(isEvmHash32(HASH.toUpperCase())).toBe(false);
  });

  it('accepts lowercase only for proofs', () => {
    expect(isLowercaseEvmHash32(HASH)).toBe(true);
    expect(isLowercaseEvmHash32(`0x${'AB'.repeat(32)}`)).toBe(false);
    expect(isLowercaseEvmHash32(HASH.toUpperCase())).toBe(false);
  });

  it('refuses anything that is not 0x and 64 hex characters', () => {
    const bare = 'ab'.repeat(32);
    for (const bad of [bare, HASH.slice(0, -1), `${HASH}a`, `${HASH.slice(0, -1)}g`, ` ${HASH}`, `0x${'ab'.repeat(65)}`, '', 7, undefined, null, [HASH]]) {
      expect(isEvmHash32(bad)).toBe(false);
      expect(isLowercaseEvmHash32(bad)).toBe(false);
    }
  });
});
