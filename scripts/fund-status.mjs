#!/usr/bin/env node
// Print both demo wallets' balances: BTC on Mutinynet, ETH and USD₮ on
// Sepolia. Read-only; needs .env.demo (the addresses are derived from its
// phrases, which are never printed).
//
//   node scripts/fund-status.mjs            account 0 of both wallets
//   node scripts/fund-status.mjs --contacts 3   also BTC contact accounts 1..3
//   node scripts/fund-status.mjs --chain bitkit-regtest
//                                           BTC of the regtest identity (BITKIT_REGTEST_MNEMONIC)
//
// BTC comes from Mutinynet's esplora API (confirmed + mempool). ETH and USD₮
// come from the keyless Sepolia RPC the app uses.
//
// `--chain` defaults to EXPO_PUBLIC_BTC_CHAIN, the app's own switch
// (src/config/btcChain.ts): unset is Mutinynet. With bitkit-regtest, the
// script prints only the regtest identity's BTC (bcrt1…, also with
// --contacts), from Bitkit's staging regtest esplora API.
import { Contract, JsonRpcProvider, formatEther } from 'ethers';

import {
  BITKIT_REGTEST_API,
  BITKIT_REGTEST_HRP,
  MUTINYNET_API,
  SEPOLIA_RPC,
  SEPOLIA_USDT,
  bitkitRegtestBtcAddress,
  btcAddressForAccount,
  btcChainFromArgs,
  demoWallets,
  formatUnits,
  readDemoEnv,
} from './lib/demo-wallets.mjs';

const { chain, rest: args } = btcChainFromArgs(process.argv.slice(2));
const contactsArg = args.indexOf('--contacts');
const contactCount = contactsArg >= 0 ? Number(args[contactsArg + 1] ?? 3) : 0;

async function btcBalance(address, api = MUTINYNET_API) {
  const response = await fetch(`${api}/address/${address}`);
  if (!response.ok) throw new Error(`${new URL(api).host} answered ${response.status}`);
  const { chain_stats: chain, mempool_stats: mempool } = await response.json();
  const confirmed = BigInt(chain.funded_txo_sum - chain.spent_txo_sum);
  const pending = BigInt(mempool.funded_txo_sum - mempool.spent_txo_sum);
  return { confirmed, pending };
}

function describeBtc({ confirmed, pending }) {
  const pendingText = pending !== 0n ? ` (${pending > 0n ? '+' : ''}${pending} sats unconfirmed)` : '';
  return `${confirmed} sats${pendingText}`;
}

async function printRegtestIdentity() {
  const env = readDemoEnv();
  const address = bitkitRegtestBtcAddress(env);
  console.log('bitkit-regtest identity');
  console.log(`  BTC   ${address}  ${describeBtc(await btcBalance(address, BITKIT_REGTEST_API))}`);
  for (let index = 1; index <= contactCount; index++) {
    const contactAddress = btcAddressForAccount('bitkit_regtest', index, env, BITKIT_REGTEST_HRP);
    console.log(`  BTC contact account ${index}  ${contactAddress}  ${describeBtc(await btcBalance(contactAddress, BITKIT_REGTEST_API))}`);
  }
}

async function printMutinynetWallets() {
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const usdt = new Contract(SEPOLIA_USDT, ['function balanceOf(address) view returns (uint256)'], provider);
  const wallets = demoWallets();
  for (const wallet of Object.values(wallets)) {
    const [btc, eth, usdtUnits] = await Promise.all([
      btcBalance(wallet.btc),
      provider.getBalance(wallet.evm),
      usdt.balanceOf(wallet.evm),
    ]);
    console.log(`${wallet.name}${wallet.name === 'ios' ? ' (treasury)' : ''}`);
    console.log(`  BTC   ${wallet.btc}  ${describeBtc(btc)}`);
    console.log(`  ETH   ${wallet.evm}  ${formatEther(eth)} ETH`);
    console.log(`  USD₮  ${wallet.evm}  ${formatUnits(usdtUnits, 6)} USD₮`);
    for (let index = 1; index <= contactCount; index++) {
      const address = btcAddressForAccount(wallet.name, index);
      console.log(`  BTC contact account ${index}  ${address}  ${describeBtc(await btcBalance(address))}`);
    }
  }
}

await (chain === 'bitkit-regtest' ? printRegtestIdentity : printMutinynetWallets)();
