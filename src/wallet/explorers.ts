// Links to public block explorers, so a user can check a transaction or
// address outside the app. Test network explorers only; Bitcoin's follows
// the build's network (src/config/btcChain.ts).
import { BTC_CHAIN } from '../config/btcChain';
import { SEPOLIA_EXPLORER } from '../config/chains';
import type { Chain } from './assets';

export function transactionUrl(chain: Chain, hash: string): string {
  return chain === 'bitcoin' ? `${BTC_CHAIN.explorer}/tx/${hash}` : `${SEPOLIA_EXPLORER}/tx/${hash}`;
}

export function addressUrl(chain: Chain, address: string): string {
  return chain === 'bitcoin' ? `${BTC_CHAIN.explorer}/address/${address}` : `${SEPOLIA_EXPLORER}/address/${address}`;
}
