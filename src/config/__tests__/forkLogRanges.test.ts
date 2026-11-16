import { execFileSync } from 'child_process';
import { join } from 'path';

// scripts/lib/fork.mjs is plain Node (ESM), which Jest does not load, so the
// test runs clampLogRanges in a child Node process and compares the result.
const forkLib = join(__dirname, '..', '..', '..', 'scripts', 'lib', 'fork.mjs');

function clamp(request: unknown, forkBlock: number): unknown {
  const code = `import { clampLogRanges } from ${JSON.stringify(forkLib)};
process.stdout.write(clampLogRanges(process.argv[1], Number(process.argv[2])));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(request), String(forkBlock)], { encoding: 'utf8' });
  return JSON.parse(out);
}

const logs = (filter: Record<string, unknown>, id = 1) => ({ jsonrpc: '2.0', id, method: 'eth_getLogs', params: [filter] });

describe('clampLogRanges (the Arbitrum fork RPC proxy)', () => {
  it('starts a range from block 0 at the fork block', () => {
    expect(clamp(logs({ fromBlock: '0x0', toBlock: 'latest' }), 256)).toEqual(logs({ fromBlock: '0x100', toBlock: 'latest' }));
  });

  it('treats a missing fromBlock and "earliest" as block 0', () => {
    expect(clamp(logs({ toBlock: 'latest' }), 256)).toEqual(logs({ fromBlock: '0x100', toBlock: 'latest' }));
    expect(clamp(logs({ fromBlock: 'earliest' }), 256)).toEqual(logs({ fromBlock: '0x100' }));
  });

  it('ends a range that lies wholly before the fork at the fork block', () => {
    expect(clamp(logs({ fromBlock: '0x0', toBlock: '0x10' }), 256)).toEqual(logs({ fromBlock: '0x100', toBlock: '0x100' }));
  });

  it('leaves ranges after the fork, blockHash filters and other methods alone', () => {
    const untouched = [
      logs({ fromBlock: '0x200', toBlock: 'latest' }, 1),
      logs({ blockHash: '0xab' }, 2),
      { jsonrpc: '2.0', id: 3, method: 'eth_blockNumber', params: [] },
    ];
    expect(clamp(untouched, 256)).toEqual(untouched);
  });

  it('rewrites each call of a batch on its own', () => {
    const batch = [logs({ fromBlock: '0x0', toBlock: 'latest' }, 1), logs({ fromBlock: '0x300' }, 2)];
    expect(clamp(batch, 256)).toEqual([logs({ fromBlock: '0x100', toBlock: 'latest' }, 1), logs({ fromBlock: '0x300' }, 2)]);
  });
});
