// Where to look for a USD₮ payment the app lost track of (no hash; see
// findSentPayment in ./usePaymentChecks.ts): what this app sent this
// session (./sentTransactions.ts, in memory only), and the chain's indexer.
//
// A chain with no indexer (EVM_CHAIN.activityApi undefined: the Arbitrum
// fork and Arbitrum One) has no history to search. There, finding nothing
// in this session's sends is not "not sent": after a relaunch those records
// are gone while the payment may well be on chain. So that case throws, and
// the caller treats it as "can't tell yet" and looks again later.
//
// Pure: no native imports, unit tested.
import type { ActivityItem } from './activity';
import { matchSentTransfer, type SentTransferMatch, type SentTransferQuery } from './paymentEvidence';

/** `indexed` is the chain's USD₮ history from its indexer, or undefined when the chain has none. */
export function matchSentUsdtPayment(sessionSends: ActivityItem[], indexed: ActivityItem[] | undefined, query: SentTransferQuery): SentTransferMatch {
  if (indexed !== undefined) return matchSentTransfer([...sessionSends, ...indexed], query);
  const match = matchSentTransfer(sessionSends, query);
  if (match.state === 'none') throw new Error('No USD₮ history on this chain to search: cannot tell whether it was sent');
  return match;
}
