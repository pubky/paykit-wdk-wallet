// Looking for a lost USD₮ payment, with and without the chain's indexer.
import type { ActivityItem } from '../activity';
import { matchSentUsdtPayment } from '../sentPaymentSearch';

const PAYEE = '0x6620afba9eb4ae3ca540ce715420ffeb70ba3b0a';
const HASH = `0x${'cd'.repeat(32)}`;

const sent = (overrides: Partial<ActivityItem> = {}): ActivityItem => ({
  id: 'i',
  chain: 'ethereum',
  asset: 'usdt',
  direction: 'out',
  amount: 5_000_000n,
  hash: HASH,
  counterpartyAddress: PAYEE,
  status: 'confirmed',
  timestamp: 2_000_000,
  accountIndex: 0,
  ...overrides,
});
const query = { asset: 'usdt' as const, to: PAYEE, amount: 5_000_000n, notBeforeMs: 1_000_000, exclude: new Set<string>() };

describe('matchSentUsdtPayment', () => {
  it("searches this session's sends and the indexer's history together", () => {
    expect(matchSentUsdtPayment([], [sent()], query)).toEqual({ state: 'found', hash: HASH });
    expect(matchSentUsdtPayment([sent()], [], query)).toEqual({ state: 'found', hash: HASH });
    // With an indexer, an empty history really means "not sent".
    expect(matchSentUsdtPayment([], [], query)).toEqual({ state: 'none' });
  });

  describe('on a chain with no indexer (the Arbitrum fork, Arbitrum One)', () => {
    it('finds a send from this session', () => {
      expect(matchSentUsdtPayment([sent()], undefined, query)).toEqual({ state: 'found', hash: HASH });
      expect(matchSentUsdtPayment([sent({ timestamp: undefined })], undefined, query)).toEqual({ state: 'unsure' });
    });

    it('never answers "none": after a relaunch the payment may be on chain with no record of it here', () => {
      expect(() => matchSentUsdtPayment([], undefined, query)).toThrow('cannot tell whether it was sent');
      expect(() => matchSentUsdtPayment([sent({ amount: 1n })], undefined, query)).toThrow();
    });
  });
});
