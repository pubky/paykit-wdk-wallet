// Links to public block explorers, so a user can check a transaction or
// address outside the app. Each follows the build's network
// (src/config/btcChain.ts, src/config/evmChain.ts). The local Arbitrum fork
// has no explorer, so its links are undefined and screens leave the
// button out instead of opening a page that cannot know the transaction.
import { BTC_CHAIN } from '../config/btcChain';
import { EVM_CHAIN } from '../config/evmChain';
import type { Chain } from './assets';

function explorerFor(chain: Chain): string | undefined {
  return chain === 'bitcoin' ? BTC_CHAIN.explorer : EVM_CHAIN.explorer;
}

export function transactionUrl(chain: Chain, hash: string): string | undefined {
  const explorer = explorerFor(chain);
  return explorer === undefined ? undefined : `${explorer}/tx/${hash}`;
}

export function addressUrl(chain: Chain, address: string): string | undefined {
  const explorer = explorerFor(chain);
  return explorer === undefined ? undefined : `${explorer}/address/${address}`;
}
