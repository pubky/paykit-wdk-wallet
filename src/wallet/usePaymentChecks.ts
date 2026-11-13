// The WDK calls behind payment requests: read a payment back from the
// chain, and sign a USD₮ payment proof.
//
//   btcSent(txid)            account 0's getTransaction: did our payment confirm?
//   btcReceived(..)          a contact account's getTransfers: what did a
//                            transaction pay into it? (useBtcReceivedReader,
//                            one per account: WDK's hooks are bound to one
//                            account index each), plus the block's time
//                            from the network's esplora
//   evmTransaction(hash)     getTransaction on the build's EVM chain:
//                            finality, success, logs
//   evmBlockTimeMs(tx)       a mined transaction's block time, read from
//                            the chain's RPC (WDK does not return it), and
//                            kept per block hash; only the payee's time
//                            check on a 'block-timestamp' chain
//                            (src/config/evmChain.ts) needs it
//   findSentPayment(query)   a payment the app lost track of (no hash):
//                            account 0's sent transfers. Bitcoin from WDK's
//                            getTransfers (mempool included), with block
//                            times from the network's esplora; USD₮ from
//                            Blockscout, since WDK's EVM module has no
//                            history call. With no indexer it returns
//                            "none" after a relaunch even if the payment is
//                            on chain, and that is safe only because
//                            findLostPayment never frees a USD₮ payment on
//                            "none"
//   signErc20Payment(typed)  signTypedData with EVM account 0, for exactly
//                            the Paykit ERC-20 proof domain on the build's
//                            chain (EVM_CHAIN.chainId, the same id
//                            requestRounds.ts puts in the typed data): the
//                            guard isErc20PaymentTypedData refuses anything else
//                            (an EIP-712 signature over another domain, such
//                            as an ERC-20 permit, could authorize spending)
//
// The WDK methods are allowed in wdk.config.js. The Paykit side calls them through
// src/features/requests/PaymentChainBridge.tsx. Errors from a read mean
// "can't tell yet": callers retry later and never treat them as "not paid".
import { useCallback, useMemo } from 'react';
import { useAccount } from '@tetherto/wdk-react-native-core';

import { EVM_CHAIN } from '../config/evmChain';
import { BTC_NETWORK, EVM_NETWORK } from '../config/wdk';
import { BTC_HISTORY_FETCH_LIMIT, parseBtcTransfers } from './activity';
import { isErc20PaymentTypedData, type Erc20PaymentTypedData } from './erc20PaymentProof';
import { fetchBtcTransactionStatus } from './esplora';
import { fetchJsonWithTimeout } from './http';
import {
  btcReceiptFromTransfers,
  btcSendStatus,
  evmBlockTimeMsFrom,
  evmTransactionFrom,
  matchSentTransfer,
  sentTransferCandidates,
  type BtcReceipt,
  type BtcSendStatus,
  type EvmTransaction,
  type SentTransferMatch,
  type SentTransferQuery,
} from './paymentEvidence';
import { retryIfElectrumDropped } from './electrumRetry';
import { sentTransactions } from './sentTransactions';
import { fetchEvmActivity } from './useActivity';

type BtcExtension = {
  getTransaction: (hash: string) => Promise<unknown>;
  getTransfers: (options: { limit?: number }) => Promise<unknown>;
};
type EvmExtension = {
  getTransaction: (hash: string) => Promise<unknown>;
  signTypedData: (typedData: Erc20PaymentTypedData) => Promise<string>;
};

export type AccountZeroPaymentChecks = {
  btcSent(txid: string): Promise<BtcSendStatus>;
  evmTransaction(hash: string): Promise<EvmTransaction>;
  /** Undefined if it can't be read: the caller keeps the proof pending. */
  evmBlockTimeMs(block: EvmBlockRef): Promise<number | undefined>;
  /** Throws when a source can't be read: the caller must not take that as "not sent". */
  findSentPayment(query: SentTransferQuery): Promise<SentTransferMatch>;
  signErc20Payment(typedData: Erc20PaymentTypedData): Promise<string>;
};

export function useAccountZeroPaymentChecks(): AccountZeroPaymentChecks {
  const btc = useAccount<BtcExtension>({ network: BTC_NETWORK, accountIndex: 0 }).extension;
  const evmAccount = useAccount<EvmExtension>({ network: EVM_NETWORK, accountIndex: 0 });
  const evm = evmAccount.extension;
  const evmAddress = evmAccount.address;
  return useMemo(
    () => ({
      btcSent: async (txid) => {
        try {
          return btcSendStatus(await btc().getTransaction(txid));
        } catch {
          // Usually "not in the history yet" (Electrum has not seen it).
          return { found: false, confirmed: false };
        }
      },
      evmTransaction: async (hash) => {
        try {
          return evmTransactionFrom(await evm().getTransaction(hash));
        } catch {
          return { state: 'unknown' };
        }
      },
      // The payee checks when it was paid (paymentProofs.ts); WDK gives only the block.
      evmBlockTimeMs: fetchEvmBlockTimeMs,
      findSentPayment: async (query) => {
        if (query.asset === 'usdt') {
          if (!evmAddress) throw new Error('The USD₮ account is not loaded yet');
          // What this app sent this session (not indexed yet), plus the chain's indexer.
          // A chain with no indexer (the Arbitrum fork) has only this
          // session's sends: after a relaunch "none" does not mean "not sent". That is
          // safe only because findLostPayment (src/paykit/requestRounds.ts) never frees
          // a USD₮ payment on "none": it stays reserved, shown as "may have been paid".
          return matchSentTransfer([...sentTransactions(), ...(await fetchEvmActivity(evmAddress))], query);
        }
        const items = sentTransferCandidates(parseBtcTransfers(await retryIfElectrumDropped(() => btc().getTransfers({ limit: BTC_HISTORY_FETCH_LIMIT })), 0), query);
        // WDK's transfers carry a block height, not a time.
        for (const item of items) {
          if (item.status === 'confirmed') item.timestamp = (await fetchBtcTransactionStatus(item.hash))?.blockTime;
        }
        return matchSentTransfer(items, query);
      },
      signErc20Payment: async (typedData) => {
        if (!isErc20PaymentTypedData(typedData, EVM_CHAIN.chainId)) throw new Error('Refusing to sign: not a Paykit ERC-20 payment proof');
        const signature = await evm().signTypedData(typedData);
        if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('The wallet returned no signature');
        return signature.toLowerCase();
      },
    }),
    [btc, evm, evmAddress],
  );
}

/** Where a mined transaction is: its receipt's block hash. */
type EvmBlockRef = { blockHash?: string };

/**
 * A mined transaction's block time (ms), read with a JSON-RPC call to the
 * chain's RPC by the receipt's block hash. Undefined if the receipt has no
 * block hash, or the read fails in any way, so the proof stays pending: a
 * block read by number could be another one after a reorg. A block's time
 * never changes, so it is kept per block hash (blockTimesByHash).
 *
 * WDK reads the same RPC from its worklet, so a failure here alone (an
 * Android build without cleartext HTTP or `adb reverse` for the fork, say)
 * would leave every such proof at "Checking when it was paid" with nothing
 * to go on. Each kind of failure is warned about once, until a read works again.
 */
async function fetchEvmBlockTimeMs(tx: EvmBlockRef): Promise<number | undefined> {
  const { blockHash } = tx;
  if (blockHash === undefined) {
    warnBlockTimeFailure('no-block', 'the receipt names no block hash');
    return undefined;
  }
  const known = blockTimesByHash.get(blockHash);
  if (known !== undefined) return known;
  const request = { method: 'eth_getBlockByHash', params: [blockHash, false] };
  let response: unknown;
  try {
    response = await fetchJsonWithTimeout(EVM_CHAIN.rpc, { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...request }) });
  } catch (error) {
    warnBlockTimeFailure('request', error instanceof Error ? error.message : String(error));
    return undefined;
  }
  if (response === undefined) {
    warnBlockTimeFailure('http', 'the RPC answered with an HTTP error');
    return undefined;
  }
  const blockTimeMs = evmBlockTimeMsFrom(response, blockHash);
  if (blockTimeMs === undefined) {
    warnBlockTimeFailure('answer', 'the answer has no block time for that block');
    return undefined;
  }
  // It works again: a failure that comes back later is worth a new warning.
  warnedBlockTimeFailures.clear();
  rememberBlockTime(blockHash, blockTimeMs);
  return blockTimeMs;
}

/** Block times read so far, by block hash. Bounded: each proof check needs only its own block. */
const blockTimesByHash = new Map<string, number>();
const BLOCK_TIMES_KEPT = 256;

function rememberBlockTime(blockHash: string, blockTimeMs: number): void {
  // A Map iterates in insertion order: the first key is the oldest.
  if (blockTimesByHash.size >= BLOCK_TIMES_KEPT) blockTimesByHash.delete(blockTimesByHash.keys().next().value!);
  blockTimesByHash.set(blockHash, blockTimeMs);
}

/** Failure kinds warned about since the last block time read, so a proof checked every minute does not repeat itself. */
const warnedBlockTimeFailures = new Set<string>();

/** EVM_CHAIN.rpc is a fixed public or local URL from src/config/chains.ts, with no key in it. */
function warnBlockTimeFailure(kind: 'no-block' | 'request' | 'http' | 'answer', reason: string): void {
  if (warnedBlockTimeFailures.has(kind)) return;
  warnedBlockTimeFailures.add(kind);
  console.warn(`USD₮ proof: could not read the block time from ${EVM_CHAIN.rpc}: ${reason}`);
}

/** A reader for one Bitcoin account: what a transaction paid into it. Undefined until the account is loaded. */
export function useBtcReceivedReader(accountIndex: number): ((txid: string, address: string) => Promise<BtcReceipt>) | undefined {
  const account = useAccount<BtcExtension>({ network: BTC_NETWORK, accountIndex });
  const ready = account.address !== null;
  const { extension } = account;
  const read = useCallback(
    async (txid: string, address: string) => {
      const receipt = btcReceiptFromTransfers(await retryIfElectrumDropped(() => extension().getTransfers({ limit: BTC_HISTORY_FETCH_LIMIT })), txid, address);
      // The payee checks when it was paid (paymentProofs.ts); WDK gives only the height.
      if (receipt.confirmed) receipt.blockTimeMs = (await fetchBtcTransactionStatus(txid))?.blockTime;
      return receipt;
    },
    [extension],
  );
  return ready ? read : undefined;
}
