#!/usr/bin/env node
// Give addresses ETH and USD₮0 on the local Anvil fork of Arbitrum One, the
// chain of the EXPO_PUBLIC_EVM_CHAIN=arbitrum-fork build and of Bitkit's
// USD₮ (docs/BITKIT-USDT-FORK.md).
//
//   node scripts/fund-fork.mjs 0xAbc…                       1,000 USD₮0 and 1 ETH
//   node scripts/fund-fork.mjs 0xAbc… 0xDef… --usdt 250 --eth 0.5
//   node scripts/fund-fork.mjs 0xAbc… --sync-time           also move the fork's clock to now
//   node scripts/fund-fork.mjs 0xAbc… --rpc http://127.0.0.1:18545
//
// It SETS balances: each address ends with exactly the amounts given,
// whatever it held before. Nothing is minted or sent. Anvil's
// anvil_setBalance and anvil_setStorageAt rewrite the fork's state, so the
// script talks only to a node on this computer. Before it writes anything,
// it refuses an --rpc that is not 127.0.0.1, and a node that is not Anvil on
// chain 42161.
//
// It takes 0x addresses only: it reads no .env.demo and no secrets. It never
// changes an address's code or nonce, because Bitkit's address may carry an
// EIP-7702 delegation.
//
// USD₮ payment proofs compare the payment's block time with when the
// request was made, and a fork's clock can lag (for example with
// --fork-block-number). The script warns when the time the next block would
// get is more than 5 minutes from this computer's clock. It reads that from
// the 'pending' block, and falls back to the latest block only when the node
// gives no pending timestamp: an idle Anvil with automine mines nothing, so
// its latest block falls behind while the next one is still stamped right.
// --sync-time mines one block at this computer's time
// (evm_setNextBlockTimestamp, then evm_mine) when that clock is behind.
import { parseArgs } from 'node:util';
import { AbiCoder, Contract, JsonRpcProvider, getAddress, keccak256, parseUnits, toBeHex, toQuantity } from 'ethers';

import { ARBITRUM_FORK_RPC, ARBITRUM_ONE_CHAIN_ID, ARBITRUM_USDT0, fail, formatUnits, loopbackHttpUrl } from './lib/fork.mjs';

const USAGE = `Usage: node scripts/fund-fork.mjs <0x address>... [--usdt <USD₮, default 1000>] [--eth <ETH, default 1>] [--rpc <url, default ${ARBITRUM_FORK_RPC}>] [--sync-time]`;
const USDT_DECIMALS = 6;
const ETH_DECIMALS = 18;
// Far above any demo and far below what could overflow the token's or the chain's sums.
const MAX_USDT = parseUnits('1000000000', USDT_DECIMALS);
const MAX_ETH = parseUnits('1000000', ETH_DECIMALS);
/** How far the fork's clock may be from this computer's before the script warns. */
const MAX_CLOCK_DRIFT_SECONDS = 5 * 60;
/** Storage slots tried for USD₮0's balance mapping, as bitkit-core's fork fixture does. */
const MAPPING_SLOTS = 100;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      usdt: { type: 'string', default: '1000' },
      eth: { type: 'string', default: '1' },
      rpc: { type: 'string', default: ARBITRUM_FORK_RPC },
      'sync-time': { type: 'boolean', default: false },
    },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values: options, positionals } = args;
if (positionals.length === 0) fail(USAGE);

/** A checksummed address from `text`, which must be a 0x address (a mixed-case one must have a valid checksum). */
function parseAddress(text) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(text)) fail(`"${text}" is not a 0x address.`);
  try {
    return getAddress(text);
  } catch {
    fail(`${text} has a wrong checksum. Check the address.`);
  }
}

/** `text` in base units, between 0 and `max`. */
function parseAmount(text, decimals, max, flag) {
  let value;
  try {
    value = parseUnits(text, decimals);
  } catch {
    fail(`${flag} needs an amount, not "${text}".`);
  }
  if (value < 0n || value > max) fail(`${flag} must be between 0 and ${formatUnits(max, decimals)}.`);
  return value;
}

const addresses = [...new Set(positionals.map(parseAddress))];
const usdt = parseAmount(options.usdt, USDT_DECIMALS, MAX_USDT, '--usdt');
const eth = parseAmount(options.eth, ETH_DECIMALS, MAX_ETH, '--eth');
let rpc;
try {
  rpc = loopbackHttpUrl(options.rpc, '--rpc');
} catch (error) {
  fail(error.message);
}

const provider = new JsonRpcProvider(rpc, Number(ARBITRUM_ONE_CHAIN_ID), { staticNetwork: true, cacheTimeout: -1 });
const token = new Contract(ARBITRUM_USDT0, ['function balanceOf(address) view returns (uint256)'], provider);
const coder = AbiCoder.defaultAbiCoder();

/** Close the connection to the node, then stop with `message`. */
function stop(message) {
  provider.destroy();
  fail(message);
}
/** The one-line reason an RPC call failed, for the messages. */
const reason = (error) => error.shortMessage ?? error.message;

// Only a local Anvil fork of Arbitrum One, checked before any write (as
// bitkit-core tests/usdt-fork/provider.mjs does).
const expectedChainId = toQuantity(ARBITRUM_ONE_CHAIN_ID);
let client;
let chainId;
try {
  [client, chainId] = await Promise.all([provider.send('web3_clientVersion', []), provider.send('eth_chainId', [])]);
} catch (error) {
  stop(`Could not reach a node at ${rpc} (${reason(error)}). Start Anvil first (docs/BITKIT-USDT-FORK.md).`);
}
if (!/anvil/i.test(String(client))) stop(`${rpc} runs "${client}", not Anvil. This script only rewrites balances on a local Anvil fork.`);
if (chainId !== expectedChainId) stop(`${rpc} is on chain ${chainId}, not Arbitrum One (${expectedChainId}). Fork https://arb1.arbitrum.io/rpc.`);

async function blockSeconds(tag) {
  const block = await provider.send('eth_getBlockByNumber', [tag, false]);
  return block?.timestamp == null ? undefined : Number(BigInt(block.timestamp));
}

/**
 * The fork's clock: the time the next block would get ('pending'), or the
 * latest block's time when the node gives no pending timestamp. `measured`
 * says which one, for the messages.
 */
async function forkClock() {
  const pending = await blockSeconds('pending').catch(() => undefined);
  if (pending !== undefined) return { seconds: pending, measured: "the fork's next block would be" };
  const latest = await blockSeconds('latest');
  if (latest === undefined) stop(`${rpc} returned no latest block.`);
  return { seconds: latest, measured: "the fork's latest block is" };
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

// An RPC failure here stops the script with one line that names the step.
let clock;
let clockStep = "Reading the fork's clock";
try {
  clock = await forkClock();
  if (options['sync-time']) {
    const now = nowSeconds();
    if (clock.seconds < now) {
      clockStep = "Mining a block at this computer's time (--sync-time)";
      await provider.send('evm_setNextBlockTimestamp', [toQuantity(now)]);
      await provider.send('evm_mine', []);
      clockStep = "Reading the fork's clock after --sync-time";
      const mined = await blockSeconds('latest');
      console.log(`Mined a block at this computer's time, ${new Date((mined ?? now) * 1000).toISOString()}.`);
      clock = await forkClock();
    } else {
      console.log("The fork's clock is not behind this computer's, so --sync-time mined nothing.");
    }
  }
} catch (error) {
  stop(`${clockStep} failed (${reason(error)}). No balance was set.`);
}
const drift = clock.seconds - nowSeconds();
if (Math.abs(drift) > MAX_CLOCK_DRIFT_SECONDS) {
  const fix = drift < 0 ? 'Run again with --sync-time.' : 'A fork cannot go back in time: restart Anvil.';
  console.warn(
    `Warning: ${clock.measured} ${Math.round(Math.abs(drift) / 60)} minutes ${drift < 0 ? 'behind' : 'ahead of'} this computer's clock. ` +
      `USD₮ payment proofs compare block time with when the request was made, so payments may be refused. ${fix}`,
  );
}

/** Where balances[account] lives for a Solidity mapping at `slot`. */
const balanceKey = (account, slot) => keccak256(coder.encode(['address', 'uint256'], [account, slot]));
const setTokenStorage = (key, value) => provider.send('anvil_setStorageAt', [ARBITRUM_USDT0, key, toBeHex(value, 32)]);

/**
 * The storage slot of USD₮0's balance mapping, ported from setMapping in
 * bitkit-core tests/usdt-fork/provider.mjs: write a probe to each candidate
 * key, keep the slot where balanceOf reads it back, and restore every
 * probe, the match included. The probe differs from the current balance, so
 * a match is never a coincidence. A failed RPC call stops the script with
 * one line that names the slot, after undoing that slot's probe; if a
 * restore fails, it stops and names that slot.
 */
async function findBalanceSlot(account) {
  let probe;
  try {
    probe = (await token.balanceOf(account)) + 1n;
  } catch (error) {
    stop(`Reading the USD₮0 balance of ${account} failed (${reason(error)}). No balance was set.`);
  }
  for (let slot = 0; slot < MAPPING_SLOTS; slot++) {
    const key = balanceKey(account, slot);
    let previous;
    try {
      previous = await provider.send('eth_getStorageAt', [ARBITRUM_USDT0, key, 'latest']);
    } catch (error) {
      stop(`Reading USD₮0 balance slot ${slot} failed (${reason(error)}). Every probe was undone.`);
    }
    let readBack;
    try {
      await setTokenStorage(key, probe);
      readBack = await token.balanceOf(account);
    } catch (error) {
      await undoProbe(key, previous, slot);
      stop(`Probing slot ${slot} failed (${reason(error)}). Every probe was undone.`);
    }
    await undoProbe(key, previous, slot);
    if (readBack === probe) return slot;
  }
  stop(`Could not find USD₮0's balance storage in slots 0 to ${MAPPING_SLOTS - 1}. Every probe was undone.`);
}

/** Write `previous` back at `key`, or stop and say the probe at `slot` may still be there. */
async function undoProbe(key, previous, slot) {
  try {
    await provider.send('anvil_setStorageAt', [ARBITRUM_USDT0, key, previous]);
  } catch (error) {
    stop(
      `Could not undo the probe at USD₮0 balance slot ${slot} (${reason(error)}). ` +
        'That slot may still hold it; restarting Anvil clears it. Every earlier probe was undone.',
    );
  }
}

console.log(`Setting ${formatUnits(usdt, USDT_DECIMALS)} USD₮0 and ${formatUnits(eth, ETH_DECIMALS)} ETH (absolute balances, not added to what is there):`);
const slot = await findBalanceSlot(addresses[0]);
// An RPC failure part-way stops the script with a message that names the
// address and says which addresses were already set, not a stack trace.
const written = [];
let step = 'Setting';
let current;
/** The address whose ETH is set but whose USD₮0 is not yet, while that is so. */
let ethOnly;
let failure;
try {
  for (const address of addresses) {
    current = address;
    await provider.send('anvil_setBalance', [address, toQuantity(eth)]);
    ethOnly = address;
    await setTokenStorage(balanceKey(address, slot), usdt);
    ethOnly = undefined;
    written.push(address);
  }
  step = 'Reading back';
  for (const address of addresses) {
    current = address;
    const [ethBalance, usdtBalance] = await Promise.all([provider.getBalance(address), token.balanceOf(address)]);
    const matches = usdtBalance === usdt && ethBalance === eth;
    if (!matches) process.exitCode = 1;
    console.log(`  ${address}  ${formatUnits(usdtBalance, USDT_DECIMALS)} USD₮0  ${formatUnits(ethBalance, ETH_DECIMALS)} ETH${matches ? '' : '  (not the amount set: check the fork)'}`);
  }
} catch (error) {
  failure =
    `${step} ${current} failed (${reason(error)}). ` +
    `Already set: ${written.length > 0 ? written.join(', ') : 'none'}.` +
    (ethOnly ? ` ${ethOnly} got its ETH but not its USD₮0.` : '');
} finally {
  provider.destroy();
}
if (failure) fail(failure);
