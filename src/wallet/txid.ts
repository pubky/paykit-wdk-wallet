// Bitcoin transaction ids: 64 hex characters. EVM 32-byte hashes
// (transaction and block hashes): 0x and 64 hex characters.
//
// Two rules, on purpose. Looking a txid up (src/wallet/esplora.ts) takes
// either letter case, as the explorer does. A payment proof
// (src/paykit/paymentProofs.ts) must carry it in lowercase, as both proof
// formats write it, so one transfer has one spelling when it is claimed.
// EVM hashes follow the same split: a block hash read from an RPC receipt
// may be in either case, a proof's transaction hash is lowercase.
//
// Pure: no native imports, unit tested.
const TXID = /^[0-9a-f]{64}$/i;
const LOWERCASE_TXID = /^[0-9a-f]{64}$/;
const EVM_HASH_32 = /^0x[0-9a-fA-F]{64}$/;
const LOWERCASE_EVM_HASH_32 = /^0x[0-9a-f]{64}$/;

/** A txid in either letter case. */
export function isTxid(value: unknown): value is string {
  return typeof value === 'string' && TXID.test(value);
}

/** A txid in lowercase hex only. */
export function isLowercaseTxid(value: unknown): value is string {
  return typeof value === 'string' && LOWERCASE_TXID.test(value);
}

/** An EVM 32-byte hash: a lowercase 0x, then 64 hex characters in either letter case. */
export function isEvmHash32(value: unknown): value is string {
  return typeof value === 'string' && EVM_HASH_32.test(value);
}

/** An EVM 32-byte hash in lowercase only: 0x, then 64 lowercase hex characters. */
export function isLowercaseEvmHash32(value: unknown): value is string {
  return typeof value === 'string' && LOWERCASE_EVM_HASH_32.test(value);
}
