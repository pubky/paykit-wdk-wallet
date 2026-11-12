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
// Without `--chain` the script reads Mutinynet. With `--chain bitkit-regtest`,
// it prints only the regtest identity's BTC (bcrt1…, also with --contacts),
// from Bitkit's staging regtest esplora API. The chain comes only from
// `--chain`, never from EXPO_PUBLIC_BTC_CHAIN.
import { Contract, JsonRpcProvider, formatEther } from 'ethers';

import {
  BITKIT_REGTEST_API,
  BITKIT_REGTEST_HRP,
  MUTINYNET_API,
  SEPOLIA_RPC,
  SEPOLIA_USDT,
  bitkitRegtestBtcAddress,
  btcBalance,
  btcChainFromArgs,
  demoWallets,
  describeBtc,
  formatUnits,
  printBtcAccounts,
  readDemoEnv,
} from './lib/demo-wallets.mjs';

async function printRegtestIdentity(contactCount) {
  const env = readDemoEnv();
  const address = bitkitRegtestBtcAddress(env);
  console.log('bitkit-regtest identity');
  console.log(`  BTC   ${address}  ${describeBtc(await btcBalance(address, BITKIT_REGTEST_API))}`);
  await printBtcAccounts('bitkit_regtest', BITKIT_REGTEST_HRP, BITKIT_REGTEST_API, contactCount, env);
}

async function printMutinynetWallets(contactCount) {
  const provider = new JsonRpcProvider(SEPOLIA_RPC);
  const usdt = new Contract(SEPOLIA_USDT, ['function balanceOf(address) view returns (uint256)'], provider);
  const env = readDemoEnv();
  const wallets = demoWallets();
  for (const wallet of Object.values(wallets)) {
    const [btc, eth, usdtUnits] = await Promise.all([
      btcBalance(wallet.btc, MUTINYNET_API),
      provider.getBalance(wallet.evm),
      usdt.balanceOf(wallet.evm),
    ]);
    console.log(`${wallet.name}${wallet.name === 'ios' ? ' (treasury)' : ''}`);
    console.log(`  BTC   ${wallet.btc}  ${describeBtc(btc)}`);
    console.log(`  ETH   ${wallet.evm}  ${formatEther(eth)} ETH`);
    console.log(`  USD₮  ${wallet.evm}  ${formatUnits(usdtUnits, 6)} USD₮`);
    await printBtcAccounts(wallet.name, 'tb', MUTINYNET_API, contactCount, env);
  }
}

try {
  const { chain, rest: args } = btcChainFromArgs(process.argv.slice(2));
  const contactsArg = args.indexOf('--contacts');
  const contactCount = contactsArg >= 0 ? Number(args[contactsArg + 1] ?? 3) : 0;
  await (chain === 'bitkit-regtest' ? printRegtestIdentity : printMutinynetWallets)(contactCount);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
