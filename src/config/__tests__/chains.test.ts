import { readFileSync } from 'fs';
import { join } from 'path';

import { btcChainFromEnv } from '../btcChain';
import * as chains from '../chains';

// The funding scripts are plain Node and keep their own copy of the chain
// constants (scripts/lib/demo-wallets.mjs, and scripts/lib/fork.mjs for the
// Arbitrum fork). This test keeps the copy in step with src/config/chains.ts,
// like versions.test.ts does for versions.
const scriptSource = (file: string) => readFileSync(join(__dirname, '..', '..', '..', 'scripts', file), 'utf8');
const script = scriptSource('lib/demo-wallets.mjs');
const forkScript = scriptSource('lib/fork.mjs');

/**
 * A script's code without its whole comment lines, so comments may name
 * what the code must not use. A trailing comment stays in, so one that
 * names it still fails.
 */
function scriptCode(file: string): string {
  return scriptSource(file)
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n');
}

function scriptConstant(name: string, source = script): string | undefined {
  const match = new RegExp(`export const ${name} = (?:'([^']*)'|(\\d+)n);`).exec(source);
  return match ? (match[1] ?? match[2]) : undefined;
}

describe('chain constants in the funding scripts', () => {
  it.each([
    ['SEPOLIA_RPC', chains.SEPOLIA_RPC],
    ['SEPOLIA_CHAIN_ID', String(chains.SEPOLIA_CHAIN_ID)],
    ['SEPOLIA_USDT', chains.SEPOLIA_USDT],
    ['AAVE_SEPOLIA_FAUCET', chains.AAVE_SEPOLIA_FAUCET],
    ['MUTINYNET_API', chains.MUTINYNET_API],
    ['MUTINYNET_FAUCET', chains.MUTINYNET_FAUCET_URL],
    ['SEPOLIA_EXPLORER', chains.SEPOLIA_EXPLORER],
    ['MUTINYNET_EXPLORER', chains.MUTINYNET_EXPLORER],
    ['BITKIT_REGTEST_EXPLORER', chains.BITKIT_REGTEST_EXPLORER],
    ['BITKIT_REGTEST_API', chains.BITKIT_REGTEST_API],
  ])('%s matches src/config/chains.ts', (name, expected) => {
    expect(scriptConstant(name)).toBe(expected);
  });

  it.each([
    ['ARBITRUM_ONE_CHAIN_ID', String(chains.ARBITRUM_ONE_CHAIN_ID)],
    ['ARBITRUM_USDT0', chains.ARBITRUM_USDT0],
    ['ARBITRUM_FORK_RPC', chains.ARBITRUM_FORK_RPC],
  ])('%s in scripts/lib/fork.mjs matches src/config/chains.ts', (name, expected) => {
    expect(scriptConstant(name, forkScript)).toBe(expected);
  });
});

describe('Bitcoin chain switch in the funding scripts', () => {
  // `export const BTC_CHAIN_VALUES = ['bitkit-regtest'];` → ['bitkit-regtest']
  const listed = /export const BTC_CHAIN_VALUES = \[([^\]]*)\];/.exec(script)?.[1];
  const scriptChainValues = listed?.match(/'[^']*'/g)?.map((quoted) => quoted.slice(1, -1)) ?? [];

  it('lists at least one chain value', () => {
    expect(scriptChainValues.length).toBeGreaterThan(0);
  });

  it.each(scriptChainValues)('accepts %s, as the app does', (value) => {
    expect(btcChainFromEnv(value).id).toBe(value);
  });

  it('uses the same regtest bech32 prefix as the app', () => {
    expect(`${scriptConstant('BITKIT_REGTEST_HRP')}1`).toBe(btcChainFromEnv('bitkit-regtest').bech32Prefix);
  });

  // The scripts pick the chain only from --chain. Reading the app's
  // EXPO_PUBLIC_BTC_CHAIN would invite exporting it in the shell, which
  // also makes `npm start` bundle regtest and breaks `npm test`. The name
  // must not appear in their code at all (so no `process.env.X`, `['X']`
  // or `const { X } = process.env`); comments may mention it.
  it.each(['lib/demo-wallets.mjs', 'lib/fork.mjs', 'fund-btc.mjs', 'fund-status.mjs'])(
    'scripts/%s never reads EXPO_PUBLIC_BTC_CHAIN',
    (file) => {
      expect(scriptCode(file)).not.toMatch(/\bEXPO_PUBLIC_BTC_CHAIN\b/);
    },
  );
});

describe('EVM chain switch in the scripts', () => {
  // Same rule for the EVM switch: exporting EXPO_PUBLIC_EVM_CHAIN would make
  // `npm start` bundle the fork and break `npm test`. The fork scripts take
  // their node from --rpc and --upstream instead.
  it.each(['lib/demo-wallets.mjs', 'lib/fork.mjs', 'fund-fork.mjs', 'arbitrum-fork-rpc.mjs', 'fund-btc.mjs', 'fund-status.mjs'])(
    'scripts/%s never reads EXPO_PUBLIC_EVM_CHAIN',
    (file) => {
      expect(scriptCode(file)).not.toMatch(/\bEXPO_PUBLIC_EVM_CHAIN\b/);
    },
  );

  // fund-fork.mjs takes 0x addresses only, so it needs no demo phrase. And it
  // must leave an address's code and nonce alone: Bitkit's address may carry
  // an EIP-7702 delegation, which anvil_setCode would wipe.
  it('scripts/fund-fork.mjs reads no .env.demo and never sets code or nonces', () => {
    const code = scriptCode('fund-fork.mjs');
    expect(code).not.toMatch(/\.env\.demo|readDemoEnv|demoWallets?\b|treasurySigner|resolveTarget|_MNEMONIC/);
    expect(code).not.toMatch(/anvil_setCode|anvil_setNonce|hardhat_setCode|hardhat_setNonce/);
  });

  // Both fork scripts refuse a node that is not on this computer.
  it.each([
    ['fund-fork.mjs', '--rpc'],
    ['arbitrum-fork-rpc.mjs', '--upstream'],
  ])('scripts/%s checks %s with loopbackHttpUrl', (file, flag) => {
    expect(scriptCode(file)).toContain(`loopbackHttpUrl(options.${flag.slice(2)}, '${flag}')`);
  });

  // Anvil listens on 127.0.0.1 only, and 'localhost' may resolve to ::1.
  // Jest (jest-expo) cannot load an .mjs file without a config change, so
  // this reads the check's source instead of calling it.
  it('loopbackHttpUrl accepts http on 127.0.0.1 only', () => {
    const code = scriptCode('lib/fork.mjs');
    expect(code).toContain("const LOOPBACK_HOST = '127.0.0.1';");
    expect(code).toContain("if (url.protocol !== 'http:' || url.hostname !== LOOPBACK_HOST) {");
  });

  // The proxy loads nothing but fork.mjs and Node built-ins (no ethers, no
  // .env.demo), and fork.mjs itself imports nothing.
  it('scripts/arbitrum-fork-rpc.mjs imports only lib/fork.mjs and node: modules', () => {
    const imports = scriptCode('arbitrum-fork-rpc.mjs').match(/from '[^']*'/g) ?? [];
    expect(imports.filter((from) => !from.startsWith("from 'node:"))).toEqual(["from './lib/fork.mjs'"]);
    expect(scriptCode('lib/fork.mjs')).not.toMatch(/\bimport\b|\brequire\(/);
  });

  // fund-fork.mjs loads ethers, Node built-ins and fork.mjs only: never
  // lib/demo-wallets.mjs, the module that reads the demo phrases.
  it('scripts/fund-fork.mjs imports only ethers, lib/fork.mjs and node: modules', () => {
    const imports = scriptCode('fund-fork.mjs').match(/from '[^']*'/g) ?? [];
    expect(imports).not.toContain("from './lib/demo-wallets.mjs'");
    expect(imports.filter((from) => !from.startsWith("from 'node:"))).toEqual(["from 'ethers'", "from './lib/fork.mjs'"]);
  });

  // The proxy and its upstream are both on 127.0.0.1, so the same port
  // would make it forward to itself.
  it('scripts/arbitrum-fork-rpc.mjs refuses an --upstream on its own port', () => {
    expect(scriptCode('arbitrum-fork-rpc.mjs')).toContain('if (upstreamPort === port) {');
  });
});
