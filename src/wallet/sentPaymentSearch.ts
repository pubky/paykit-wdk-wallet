// Where to look for a USD₮ payment the app lost track of (no hash; see
// findSentPayment in ./usePaymentChecks.ts): what this app sent this
// session (./sentTransactions.ts, in memory only), and the chain's indexer.
//
// A chain with no indexer (EVM_CHAIN.activityApi undefined: the Arbitrum
// fork and Arbitrum One) has only this session's sends to search. After a
// relaunch those records are gone while the payment may well be on chain,
// so "none" there does not mean "not sent". That is safe: the caller never
// frees a USD₮ payment on "none" (findLostPayment in
// src/paykit/requestRounds.ts). It stays reserved and shows as "may have
// been paid"; it just cannot be linked to its transaction automatically.
//
// Pure: no native imports, unit tested.
import type { ActivityItem } from './activity';
import { matchSentTransfer, type SentTransferMatch, type SentTransferQuery } from './paymentEvidence';

/** `indexed` is the chain's USD₮ history from its indexer, or undefined when the chain has none. */
export function matchSentUsdtPayment(sessionSends: ActivityItem[], indexed: ActivityItem[] | undefined, query: SentTransferQuery): SentTransferMatch {
  return matchSentTransfer([...sessionSends, ...(indexed ?? [])], query);
}
