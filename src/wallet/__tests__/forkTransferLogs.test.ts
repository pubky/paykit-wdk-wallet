// USD₮ history on the local Arbitrum fork, read from Transfer logs
// (parseUsdtTransferLogs). Tests run with the default chain, so the token is
// Sepolia's; the parser only cares that it is EVM_CHAIN.usdtToken.
import { SEPOLIA_USDT } from '../../config/chains';
import { ERC20_TRANSFER_TOPIC, parseUsdtTransferLogs } from '../activity';

const ME = '0x00000000000000000000000000000000000000aa';
const BEN = '0x00000000000000000000000000000000000000bb';
const topic = (address: string) => `0x${'0'.repeat(24)}${address.slice(2)}`;

function transfer(from: string, to: string, value: bigint, extra: Record<string, unknown> = {}) {
  return {
    address: SEPOLIA_USDT.toLowerCase(),
    topics: [ERC20_TRANSFER_TOPIC, topic(from), topic(to)],
    data: `0x${value.toString(16).padStart(64, '0')}`,
    transactionHash: '0xabc',
    logIndex: '0x2',
    blockNumber: '0x10',
    ...extra,
  };
}

describe('parseUsdtTransferLogs', () => {
  const times = new Map([['0x10', 1_700_000_000_000]]);

  it('lists a received transfer with its sender, amount and block time', () => {
    expect(parseUsdtTransferLogs([transfer(BEN, ME, 5_000_000n)], ME, times)).toEqual([
      {
        id: 'ethereum:0xabc:usdt:2',
        chain: 'ethereum',
        asset: 'usdt',
        direction: 'in',
        amount: 5_000_000n,
        hash: '0xabc',
        counterpartyAddress: BEN,
        timestamp: 1_700_000_000_000,
        status: 'confirmed',
        accountIndex: 0,
      },
    ]);
  });

  it('lists a sent transfer as outgoing, to its recipient', () => {
    const [item] = parseUsdtTransferLogs([transfer(ME, BEN, 1_000_000n)], ME, new Map());
    expect(item).toMatchObject({ direction: 'out', counterpartyAddress: BEN, timestamp: undefined });
  });

  it('skips other tokens, other events, removed logs and transfers between other people', () => {
    const logs = [
      transfer(BEN, ME, 1n, { address: '0x00000000000000000000000000000000000000cc' }),
      transfer(BEN, ME, 1n, { topics: ['0x1234', topic(BEN), topic(ME)] }),
      transfer(BEN, ME, 1n, { removed: true }),
      transfer(BEN, '0x00000000000000000000000000000000000000dd', 1n),
      null,
      'not a log',
    ];
    expect(parseUsdtTransferLogs(logs, ME, times)).toEqual([]);
  });

  it('keeps one row per direction when the sent and received queries both return a log', () => {
    const toSelf = transfer(ME, ME, 3n);
    const items = parseUsdtTransferLogs([toSelf, toSelf, toSelf], ME, times);
    expect(items.map((item) => item.direction)).toEqual(['out']);
    expect(parseUsdtTransferLogs([transfer(BEN, ME, 3n), transfer(BEN, ME, 3n)], ME, times)).toHaveLength(1);
  });

  it('returns nothing for an answer that is not a list', () => {
    expect(parseUsdtTransferLogs({ error: 'nope' }, ME, times)).toEqual([]);
  });
});
