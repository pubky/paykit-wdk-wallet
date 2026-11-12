// Bitcoin transaction ids: 64 hex characters.
//
// Two rules, on purpose. Looking a txid up (src/wallet/esplora.ts) takes
// either letter case, as the explorer does. A payment proof
// (src/paykit/paymentProofs.ts) must carry it in lowercase, as both proof
// formats write it, so one transfer has one spelling when it is claimed.
//
// Pure: no native imports, unit tested.
const TXID = /^[0-9a-f]{64}$/i;
const LOWERCASE_TXID = /^[0-9a-f]{64}$/;

/** A txid in either letter case. */
export function isTxid(value: unknown): value is string {
  return typeof value === 'string' && TXID.test(value);
}

/** A txid in lowercase hex only. */
export function isLowercaseTxid(value: unknown): value is string {
  return typeof value === 'string' && LOWERCASE_TXID.test(value);
}
