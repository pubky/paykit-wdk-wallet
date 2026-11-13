// Shared helpers for the host-side funding scripts (scripts/fund-*.mjs) and
// the local Arbitrum fork's RPC proxy (scripts/arbitrum-fork-rpc.mjs).
//
// The two demo wallets are defined by the BIP-39 phrases in the git-ignored
// .env.demo (IOS_MNEMONIC, ANDROID_MNEMONIC). These helpers derive the same
// addresses the app derives with WDK, so the scripts and the app agree on
// where the money is:
//
//   EVM (ETH and USD₮ on Sepolia)  m/44'/60'/0'/0/0   WDK wallet-evm getAccount(0)
//   BTC (Mutinynet, P2WPKH tb1q…)  m/84'/1'/0'/0/0    WDK wallet-btc getAccount(0), network 'testnet'
//   BTC (regtest, P2WPKH bcrt1q…)  m/84'/1'/0'/0/0    WDK wallet-btc getAccount(0), network 'regtest'
//
// Checked in @tetherto/wdk-wallet-btc 1.0.0-beta.17 (src/wallet-account-btc.js):
// the path is m/<bip>'/<0 for 'bitcoin', else 1>'/0'/0/<index>, so testnet
// and regtest share coin type 1 and the same key; only the address differs.
// The address is bitcoinjs-lib's payments.p2wpkh with networks.regtest,
// whose bech32 prefix is 'bcrt'. The regtest identity is a third phrase
// (BITKIT_REGTEST_MNEMONIC, docs/BITKIT-DEMO.md).
//
// Both use the BIP-39 seed with an empty passphrase, like WDK. The iOS demo
// wallet doubles as the treasury: its EVM key signs the Sepolia scripts.
//
// Secrets stay in this process: nothing here prints a phrase or a private
// key. Only addresses (public) leave these functions, plus an ethers Wallet
// object for signing that callers must never log.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bech32, bech32m } from '@scure/base';
import { HDNodeWallet, JsonRpcProvider, getBytes, ripemd160, sha256 } from 'ethers';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_PATH = join(ROOT, '.env.demo');

// Chain constants. They mirror src/config/chains.ts (which is TypeScript and
// cannot be imported from plain Node without a build step);
// src/config/__tests__/chains.test.ts fails if the two drift apart.
export const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';
export const SEPOLIA_CHAIN_ID = 11155111n;
export const SEPOLIA_USDT = '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0';
export const AAVE_SEPOLIA_FAUCET = '0xC959483DBa39aa9E78757139af0e9a2EDEb3f42D';
export const MUTINYNET_API = 'https://mutinynet.com/api';
export const MUTINYNET_FAUCET = 'https://faucet.mutinynet.com';
export const SEPOLIA_EXPLORER = 'https://sepolia.etherscan.io';
export const MUTINYNET_EXPLORER = 'https://mutinynet.com';
/** Bitkit's staging regtest explorer (BITKIT_REGTEST_EXPLORER in src/config/chains.ts). */
export const BITKIT_REGTEST_EXPLORER = 'https://mempool.bitkit.stag0.blocktank.to';
/** Bitkit's staging regtest esplora API (BITKIT_REGTEST_API in src/config/chains.ts). */
export const BITKIT_REGTEST_API = 'https://mempool.bitkit.stag0.blocktank.to/api';
/**
 * Blocktank's staging regtest chain API: `deposit` and `mine`, the calls
 * Bitkit's Dev Settings › Blocktank Regtest make (rust-blocktank-client 0.0.16).
 */
export const BLOCKTANK_REGTEST_CHAIN_API = 'https://api.stag0.blocktank.to/blocktank/api/v2/regtest/chain';
/** Arbitrum One, which the local Anvil fork keeps (ARBITRUM_ONE_CHAIN_ID in src/config/chains.ts). */
export const ARBITRUM_ONE_CHAIN_ID = 42161n;
/** USD₮0 on Arbitrum One, 6 decimals, lowercase as Bitkit writes it (ARBITRUM_USDT0 in src/config/chains.ts). */
export const ARBITRUM_USDT0 = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
/** The local Anvil fork of Arbitrum One (ARBITRUM_FORK_RPC in src/config/chains.ts). */
export const ARBITRUM_FORK_RPC = 'http://127.0.0.1:18545';

/** The only hosts the fork scripts talk to: this computer. */
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost'];

/**
 * `text` as a normalized http URL on this computer (127.0.0.1 or
 * localhost). Throws for anything else; `flag` names the option in the
 * message. The fork scripts rewrite or relay a local Anvil node's state,
 * so they refuse to point at a node on another machine.
 */
export function loopbackHttpUrl(text, flag) {
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${flag} is not a URL: "${text}"`);
  }
  if (url.protocol !== 'http:' || !LOOPBACK_HOSTS.includes(url.hostname)) {
    throw new Error(`${flag} must be http://127.0.0.1:<port> or http://localhost:<port>, not "${text}": only a node on this computer is allowed.`);
  }
  return url.href;
}

/**
 * The values the scripts' --chain accepts: the same values the app's
 * EXPO_PUBLIC_BTC_CHAIN accepts (btcChainFromEnv in src/config/btcChain.ts).
 * No --chain is Mutinynet; anything not listed here is refused.
 */
export const BTC_CHAIN_VALUES = ['bitkit-regtest'];
/** Regtest's bech32 prefix, without the '1' separator (bech32Prefix 'bcrt1' in src/config/btcChain.ts). */
export const BITKIT_REGTEST_HRP = 'bcrt';

/**
 * Pull `--chain <value>` out of command-line arguments. Returns the chain
 * ('mutinynet' without --chain, or one of BTC_CHAIN_VALUES) and the
 * remaining arguments.
 *
 * Only an explicit --chain picks the chain, never the environment: an
 * exported EXPO_PUBLIC_BTC_CHAIN would also make `npm start` bundle regtest
 * and break `npm test`, so the docs never ask for one.
 */
export function btcChainFromArgs(argv) {
  const at = argv.indexOf('--chain');
  if (at < 0) return { chain: 'mutinynet', rest: argv };
  const value = argv[at + 1];
  if (!BTC_CHAIN_VALUES.includes(value)) {
    const problem = value === undefined ? '--chain needs a value' : `Unknown chain "${value}"`;
    throw new Error(`${problem}. Use ${BTC_CHAIN_VALUES.join(' or ')}, or leave out --chain for Mutinynet.`);
  }
  return { chain: value, rest: [...argv.slice(0, at), ...argv.slice(at + 2)] };
}

/** Bech32 data characters (BIP-173); the human-readable part is checked on its own. */
const BECH32_DATA = /^[02-9ac-hj-np-z]{8,}$/;
/** BIP-173's limit for a whole bech32 string, prefix and separator included. */
const BECH32_MAX_LENGTH = 90;

/**
 * Whether `text` is a lowercase bech32 address with prefix `hrp` ('tb',
 * 'bcrt'): `<hrp>1` and bech32 data characters, at most 90 characters in
 * all, with a valid checksum. Witness v0 (P2WPKH) addresses use bech32 and
 * v1 (P2TR) use bech32m (BIP-350), so either checksum is accepted, which
 * catches a mistyped character. It does not check the witness program.
 */
export function isBech32Address(text, hrp) {
  if (
    text.length > BECH32_MAX_LENGTH ||
    !text.startsWith(`${hrp}1`) ||
    !BECH32_DATA.test(text.slice(hrp.length + 1))
  ) {
    return false;
  }
  const decoded = bech32.decodeUnsafe(text, BECH32_MAX_LENGTH) ?? bech32m.decodeUnsafe(text, BECH32_MAX_LENGTH);
  return decoded?.prefix === hrp;
}

const EVM_PATH = "m/44'/60'/0'/0/0";
/** BTC account i (0 = spending, 1, 2, … = contact accounts), as WDK's getAccount(i) on testnet and regtest. */
const btcPath = (accountIndex) => `m/84'/1'/0'/0/${accountIndex}`;

/** Read .env.demo into an object. Values are secrets: never print them. */
export function readDemoEnv() {
  if (!existsSync(ENV_PATH)) {
    throw new Error('No .env.demo found. See README.md, "First launch".');
  }
  const values = {};
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return values;
}

/**
 * A P2WPKH address for a compressed secp256k1 public key: bech32 prefix
 * 'tb' (testnet and signets such as Mutinynet, tb1q…) or 'bcrt' (regtest, bcrt1q…).
 */
export function p2wpkhAddress(compressedPublicKeyHex, hrp) {
  const hash160 = getBytes(ripemd160(sha256(compressedPublicKeyHex)));
  return bech32.encode(hrp, [0, ...bech32.toWords(hash160)]);
}

/** A P2WPKH testnet address (tb1q…) for a compressed secp256k1 public key. */
export function p2wpkhTestnetAddress(compressedPublicKeyHex) {
  return p2wpkhAddress(compressedPublicKeyHex, 'tb');
}

/**
 * The public side of one demo wallet: { name, evm, btc }. Throws if the
 * phrase is missing; the message names the key, never the value.
 */
export function demoWallet(name, env = readDemoEnv()) {
  const key = `${name.toUpperCase()}_MNEMONIC`;
  const phrase = env[key];
  if (!phrase) throw new Error(`${key} is not set in .env.demo`);
  const evm = HDNodeWallet.fromPhrase(phrase, '', EVM_PATH);
  const btc = HDNodeWallet.fromPhrase(phrase, '', btcPath(0));
  return { name, evm: evm.address, btc: p2wpkhTestnetAddress(btc.publicKey) };
}

/**
 * A demo wallet's BTC address for account `accountIndex` (contact accounts
 * are 1, 2, …), with bech32 prefix `hrp`: 'tb' for Mutinynet, 'bcrt' for
 * regtest. Public only.
 */
export function btcAddressForAccount(name, accountIndex, env = readDemoEnv(), hrp = 'tb') {
  const key = `${name.toUpperCase()}_MNEMONIC`;
  const phrase = env[key];
  if (!phrase) throw new Error(`${key} is not set in .env.demo`);
  return p2wpkhAddress(HDNodeWallet.fromPhrase(phrase, '', btcPath(accountIndex)).publicKey, hrp);
}

/**
 * The regtest demo identity's BTC account 0 (bcrt1q…), from
 * BITKIT_REGTEST_MNEMONIC. Public only.
 */
export function bitkitRegtestBtcAddress(env = readDemoEnv()) {
  return btcAddressForAccount('bitkit_regtest', 0, env, BITKIT_REGTEST_HRP);
}

/** An address's BTC balance in sats from an esplora API: confirmed, and unconfirmed (mempool). */
export async function btcBalance(address, api) {
  const response = await fetch(`${api}/address/${address}`);
  if (!response.ok) throw new Error(`${new URL(api).host} answered ${response.status}`);
  const { chain_stats: chain, mempool_stats: mempool } = await response.json();
  const confirmed = BigInt(chain.funded_txo_sum - chain.spent_txo_sum);
  const pending = BigInt(mempool.funded_txo_sum - mempool.spent_txo_sum);
  return { confirmed, pending };
}

/** "<confirmed> sats", plus the unconfirmed change if there is one. */
export function describeBtc({ confirmed, pending }) {
  const pendingText = pending !== 0n ? ` (${pending > 0n ? '+' : ''}${pending} sats unconfirmed)` : '';
  return `${confirmed} sats${pendingText}`;
}

/**
 * Print the BTC address and balance of a demo wallet's contact accounts
 * 1..`count` (the wallet's phrase is `<NAME>_MNEMONIC`), with bech32
 * prefix `hrp`, from the esplora API `api`. Public only.
 */
export async function printBtcAccounts(name, hrp, api, count, env = readDemoEnv()) {
  const addresses = Array.from({ length: count }, (_, i) => btcAddressForAccount(name, i + 1, env, hrp));
  const balances = await Promise.all(addresses.map((address) => btcBalance(address, api)));
  addresses.forEach((address, i) => {
    console.log(`  BTC contact account ${i + 1}  ${address}  ${describeBtc(balances[i])}`);
  });
}

/** Both demo wallets' public addresses, from `env` (.env.demo by default). */
export function demoWallets(env = readDemoEnv()) {
  return { ios: demoWallet('ios', env), android: demoWallet('android', env) };
}

/**
 * The treasury signer: the iOS demo wallet's EVM account 0, connected to
 * Sepolia. Never log this object; it holds the private key.
 */
export function treasurySigner() {
  const phrase = readDemoEnv().IOS_MNEMONIC;
  if (!phrase) throw new Error('IOS_MNEMONIC is not set in .env.demo');
  return HDNodeWallet.fromPhrase(phrase, '', EVM_PATH).connect(new JsonRpcProvider(SEPOLIA_RPC, Number(SEPOLIA_CHAIN_ID)));
}

/** Resolve "ios" / "android" to that wallet's address on `chain`, or accept a literal address. */
export function resolveTarget(text, chain) {
  if (text === 'ios' || text === 'android') return demoWallets()[text][chain];
  return text;
}

/** Format base units as a decimal string (bigint in, string out). */
export function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
