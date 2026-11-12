#!/usr/bin/env node
// Get test sats: from the Mutinynet faucet's API (the default), or from
// Blocktank's staging regtest for a Bitkit regtest build (docs/BITKIT-DEMO.md).
//
//   node scripts/fund-btc.mjs --login           one-time GitHub device login, saves a 24 h faucet token
//   node scripts/fund-btc.mjs ios               100,000 sats to the iOS wallet
//   node scripts/fund-btc.mjs android 50000
//   node scripts/fund-btc.mjs tb1q… 20000
//
//   node scripts/fund-btc.mjs --chain bitkit-regtest bitkit-regtest 100000
//                                               regtest sats to the identity from BITKIT_REGTEST_MNEMONIC
//   node scripts/fund-btc.mjs --chain bitkit-regtest bcrt1q… 50000
//   node scripts/fund-btc.mjs --chain bitkit-regtest --mine 3
//                                               mine 3 regtest blocks
//
// `--chain` defaults to EXPO_PUBLIC_BTC_CHAIN, the app's own switch
// (src/config/btcChain.ts): unset is Mutinynet.
//
// Regtest: Bitkit's staging regtest has no faucet. Blocktank's staging API
// makes coins on request, with the calls Bitkit's Dev Settings › Blocktank
// Regtest make (rust-blocktank-client 0.0.16): POST …/regtest/chain/deposit
// {"address", "amountSat"} answers the funding txid as plain text, and
// POST …/regtest/chain/mine {"count"} answers an empty 2xx. A deposit is
// followed by one mined block, so it confirms at once. No token is needed.
// Written from Bitkit's client; not yet run from this script.
//
// The faucet (faucet.mutinynet.com, source: MutinyWallet/mutinynet-faucet-rs)
// needs a Bearer JWT, valid for 24 hours, that it issues after a GitHub
// login. `--login` runs GitHub's device flow with the faucet's OAuth app:
// you open github.com/login/device, type the code it prints, and the script
// stores the faucet JWT as MUTINYNET_FAUCET_TOKEN in the git-ignored
// .env.demo. The token is never printed. The GitHub token itself is used
// once and not stored. Limit: 1,000,000 sats per GitHub user and IP per day.
//
// Not yet run end to end (GitHub's device-code step is verified; the
// faucet's token exchange is not). Fallback: `mutinynet-cli login`, then
// copy ~/.mutinynet/token into .env.demo as MUTINYNET_FAUCET_TOKEN.
import { appendFileSync, chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BITKIT_REGTEST_EXPLORER,
  BLOCKTANK_REGTEST_CHAIN_API,
  MUTINYNET_EXPLORER,
  MUTINYNET_FAUCET,
  ROOT,
  bitkitRegtestBtcAddress,
  readDemoEnv,
  resolveTarget,
} from './lib/demo-wallets.mjs';

/** The faucet's GitHub OAuth app (GET https://faucet.mutinynet.com/auth/github/client_id). */
const GITHUB_CLIENT_ID = 'Ov23liIa6qfR9KtYHwUF';
const MAX_SATS = 1_000_000;
const MAX_REGTEST_SATS = 10_000_000;
const MAX_REGTEST_BLOCKS = 100;
const REGTEST_ADDRESS = /^bcrt1[02-9ac-hj-np-z]{8,87}$/;
const TXID = /^[0-9a-f]{64}$/;

const USAGE = `Usage:
  node scripts/fund-btc.mjs --login | <ios|android|tb1…> [sats, default 100000]
  node scripts/fund-btc.mjs --chain bitkit-regtest <bitkit-regtest|bcrt1…> [sats, default 100000]
  node scripts/fund-btc.mjs --chain bitkit-regtest --mine <blocks>
--chain defaults to EXPO_PUBLIC_BTC_CHAIN (unset: Mutinynet).`;

/** The chain from --chain or EXPO_PUBLIC_BTC_CHAIN, as the app reads it: unset is Mutinynet, anything unknown is refused. */
function chainFrom(value) {
  if (value === undefined || value === '') return 'mutinynet';
  if (value === 'bitkit-regtest') return value;
  throw new Error(`Unknown chain "${value}". Leave it unset for Mutinynet, or use bitkit-regtest.`);
}

/** A whole number in [min, max], or an error that says the range. */
function wholeNumber(text, min, max, what) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Ask for between ${min.toLocaleString('en-US')} and ${max.toLocaleString('en-US')} ${what}.`);
  }
  return value;
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text.slice(0, 200) };
  }
  return { ok: response.ok, status: response.status, json };
}

function saveToken(token) {
  const envPath = join(ROOT, '.env.demo');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const kept = lines.filter((line) => !/^\s*MUTINYNET_FAUCET_TOKEN\s*=/.test(line));
  writeFileSync(envPath, kept.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
  appendFileSync(envPath, `MUTINYNET_FAUCET_TOKEN=${token}\n`);
  chmodSync(envPath, 0o600);
}

async function login() {
  const device = await postJson('https://github.com/login/device/code', { client_id: GITHUB_CLIENT_ID, scope: 'user:email' });
  if (!device.ok || !device.json.device_code) throw new Error(`GitHub refused the device login (${device.status}).`);
  const { device_code: deviceCode, user_code: userCode, verification_uri: uri, interval = 5, expires_in: expiresIn } = device.json;
  console.log(`Open ${uri} and enter the code ${userCode} (valid ${Math.round(expiresIn / 60)} minutes). Waiting…`);

  let pollSeconds = interval;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
    const poll = await postJson('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (poll.json.access_token) {
      const exchange = await postJson(`${MUTINYNET_FAUCET}/auth/github/device`, { code: poll.json.access_token });
      if (!exchange.ok || !exchange.json.token) throw new Error(`The faucet refused the GitHub login (${exchange.status}).`);
      saveToken(exchange.json.token);
      console.log('Saved MUTINYNET_FAUCET_TOKEN to .env.demo (valid for 24 hours).');
      return;
    }
    if (poll.json.error === 'slow_down') pollSeconds += 5;
    else if (poll.json.error !== 'authorization_pending') throw new Error(`GitHub login failed: ${poll.json.error}`);
  }
}

async function fund(targetArg, satsArg) {
  const token = readDemoEnv().MUTINYNET_FAUCET_TOKEN;
  if (!token) throw new Error('MUTINYNET_FAUCET_TOKEN is not set. Run: node scripts/fund-btc.mjs --login');
  const address = resolveTarget(targetArg, 'btc');
  const sats = wholeNumber(satsArg, 1_000, MAX_SATS, 'sats');

  console.log(`Asking the Mutinynet faucet for ${sats} sats to ${address}…`);
  const result = await postJson(`${MUTINYNET_FAUCET}/api/onchain`, { sats, address }, { authorization: `Bearer ${token}` });
  if (result.status === 401) throw new Error('The faucet token was refused (it lasts 24 hours). Run: node scripts/fund-btc.mjs --login');
  if (!result.ok || !result.json.txid) throw new Error(`The faucet answered ${result.status}: ${result.json.error ?? 'no txid'}`);
  console.log(`Sent ${result.json.txid}: ${MUTINYNET_EXPLORER}/tx/${result.json.txid}`);
}

/** POST JSON to Blocktank's regtest chain API; returns the response body as text. */
async function blocktankRegtest(call, body) {
  const response = await fetch(`${BLOCKTANK_REGTEST_CHAIN_API}/${call}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = (await response.text()).trim();
  if (!response.ok) throw new Error(`Blocktank's regtest ${call} answered ${response.status}: ${text.slice(0, 200) || 'no body'}`);
  return text;
}

async function mineRegtest(countArg) {
  const count = wholeNumber(countArg, 1, MAX_REGTEST_BLOCKS, 'blocks');
  await blocktankRegtest('mine', { count });
  console.log(`Mined ${count} regtest ${count === 1 ? 'block' : 'blocks'}.`);
}

async function fundRegtest(targetArg, satsArg) {
  const address = targetArg === 'bitkit-regtest' ? bitkitRegtestBtcAddress() : targetArg.toLowerCase();
  if (!REGTEST_ADDRESS.test(address)) throw new Error('Give a regtest address (bcrt1…) or bitkit-regtest.');
  const amountSat = wholeNumber(satsArg, 1_000, MAX_REGTEST_SATS, 'sats');

  console.log(`Asking Blocktank's staging regtest for ${amountSat} sats to ${address}…`);
  const txid = await blocktankRegtest('deposit', { address, amountSat });
  if (!TXID.test(txid)) throw new Error(`Blocktank's regtest deposit answered without a txid: ${txid.slice(0, 200)}`);
  console.log(`Sent ${txid}: ${BITKIT_REGTEST_EXPLORER}/tx/${txid}`);
  await mineRegtest('1');
}

/** Pull `--chain <id>` out of the arguments; the rest are the command. */
function splitChain(argv) {
  const at = argv.indexOf('--chain');
  if (at < 0) return { chainArg: process.env.EXPO_PUBLIC_BTC_CHAIN, rest: argv };
  if (argv[at + 1] === undefined) throw new Error('--chain needs a value: bitkit-regtest.');
  return { chainArg: argv[at + 1], rest: [...argv.slice(0, at), ...argv.slice(at + 2)] };
}

try {
  const { chainArg, rest: args } = splitChain(process.argv.slice(2));
  const chain = chainFrom(chainArg);
  const regtest = chain === 'bitkit-regtest';
  if (args[0] === '--help' || args[0] === '-h') console.log(USAGE);
  else if (!args[0]) {
    console.error(USAGE);
    process.exit(1);
  } else if (args[0] === '--login') {
    if (regtest) throw new Error('Regtest has no faucet and needs no login.');
    await login();
  } else if (args[0] === '--mine') {
    if (!regtest) throw new Error('Mutinynet mines its own blocks every 30 s. --mine is for --chain bitkit-regtest.');
    await mineRegtest(args[1] ?? '');
  } else await (regtest ? fundRegtest : fund)(args[0], args[1] ?? '100000');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
