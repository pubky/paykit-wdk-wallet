import { withEvmChain } from '../../../config/__tests__/withEvmChain';
import type { ActivityItem } from '../../../wallet';
import { activityPersonHint, activityStatusWords, activityTitle, isFaucetMint } from '../activity/activityText';

const base: ActivityItem = {
  id: 'ethereum:0x1:usdt:0',
  chain: 'ethereum',
  asset: 'usdt',
  direction: 'in',
  amount: 1n,
  hash: '0x1',
  status: 'confirmed',
  accountIndex: 0,
};

describe('activity words', () => {
  it('recognises faucet mints, local or indexed', () => {
    expect(isFaucetMint({ ...base, counterpartyAddress: '0x0000000000000000000000000000000000000000' })).toBe(true);
    expect(isFaucetMint({ ...base, id: 'ethereum:0x1:local:faucet' })).toBe(true);
    expect(isFaucetMint({ ...base, counterpartyAddress: '0x83A881Ddad0F675A3d57d306F3F4E6b352b95CD0' })).toBe(false);
    expect(activityTitle({ ...base, id: 'ethereum:0x1:local:faucet' })).toBe('Test USD₮ minted');
  });

  it('names sends, receipts and collects', () => {
    expect(activityTitle({ ...base, counterpartyAddress: '0xabc' })).toBe('Received');
    expect(activityTitle({ ...base, direction: 'out' })).toBe('Sent');
    expect(activityTitle({ ...base, chain: 'bitcoin', asset: 'btc', direction: 'out', accountIndex: 2 })).toBe('Moved to main account');
  });

  it('describes status', () => {
    expect(activityStatusWords({ ...base, status: 'pending' })).toBe('Pending');
    expect(activityStatusWords(base)).toBe('Confirmed');
    expect(activityStatusWords({ ...base, status: 'failed' })).toBe('Failed');
  });

  it('says which of their addresses a payment went to, truthfully per asset', () => {
    const btcOut: ActivityItem = { ...base, chain: 'bitcoin', asset: 'btc', direction: 'out' };
    expect(activityPersonHint(btcOut, 'you-paid', false)).toBe('Paid to a Bitcoin address they shared only with you');
    // USD₮ goes to the one Ethereum address everyone pays: never "only with you".
    expect(activityPersonHint({ ...base, direction: 'out' }, 'you-paid', false)).toBe('Paid to their Ethereum address, the same one everyone pays');
    expect(activityPersonHint({ ...btcOut, direction: 'in', accountIndex: 1 }, 'paid-you', false)).toBe('Paid to the private address you gave them');
    // A request payment we made: the request section says what it paid.
    expect(activityPersonHint(btcOut, 'you-paid', true)).toBeUndefined();
    // A request payment into our contact account still says it reached the private address.
    expect(activityPersonHint({ ...btcOut, direction: 'in', accountIndex: 1 }, 'paid-you', true)).toBe('Paid to the private address you gave them');
    expect(activityPersonHint({ ...btcOut, movedFromAccount: 1, direction: 'in' }, 'moved', false)).toBeUndefined();
  });
});

describe('activity words on the local Arbitrum fork', () => {
  const ZERO = '0x0000000000000000000000000000000000000000';
  const fork = () => withEvmChain('arbitrum-fork', () => jest.requireActual<typeof import('../activity/activityText')>('../activity/activityText'));

  it('never calls a zero-address USD₮ transfer a faucet mint (USD₮0 is minted when bridged in)', () => {
    const text = fork();
    expect(text.isFaucetMint({ ...base, counterpartyAddress: ZERO })).toBe(false);
    expect(text.isFaucetMint({ ...base, id: 'ethereum:0x1:local:faucet' })).toBe(false);
    expect(text.activityTitle({ ...base, counterpartyAddress: ZERO })).toBe('Received');
  });

  it('names the fork as the network', () => {
    expect(fork().networkName(base)).toBe('Arbitrum (local fork)');
  });
});
