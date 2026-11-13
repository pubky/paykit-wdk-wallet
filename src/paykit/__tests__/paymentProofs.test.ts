// Payment proofs: their JSON, and the payee's on-chain checks.
import { Wallet, id, type HDNodeWallet } from 'ethers';

import { ARBITRUM_USDT0, SEPOLIA_CHAIN_ID, SEPOLIA_USDT } from '../../config/chains';
import { EVM_CHAIN } from '../../config/evmChain';
import { ERC20_TRANSFER_TOPIC, erc20PaymentTypedData, type Erc20PaymentMessage, type Erc20RequestBinding } from '../../wallet/erc20PaymentProof';
import { evmTransactionFrom, type EvmTransaction } from '../../wallet/paymentEvidence';
import fixtures from '../../wallet/__tests__/fixtures/erc20-payment-proofs.json';
import {
  btcProofJson,
  erc20ProofJson,
  EVM_BLOCK_TIMESTAMP_ALLOWANCE_MS,
  latestSepoliaBlockTimeMs,
  parseProof,
  paymentNotBefore,
  proofTransactionHash,
  transferKey,
  verifyBtcProof,
  verifyErc20Proof,
  verifyErc20ProofReadingBlockTime,
} from '../paymentProofs';
import { withBtcChain, withEvmChain } from '../../config/__tests__/withEnv';

const TXID = 'ab'.repeat(32);
const NOW = Date.parse('2026-10-26T12:00:00Z');
const HASH = `0x${'cd'.repeat(32)}`;
const PAYEE_EVM = '0x6620afba9eb4ae3ca540ce715420ffeb70ba3b0a';
const pad = (address: string) => `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;

describe('proof JSON', () => {
  it('round-trips a Bitcoin proof', () => {
    expect(parseProof(btcProofJson(TXID.toUpperCase()))).toEqual({ kind: 'btc', txid: TXID });
    expect(proofTransactionHash(btcProofJson(TXID))).toBe(TXID);
  });

  it('round-trips an ERC-20 proof', () => {
    const json = erc20ProofJson({ transactionHash: HASH, receiptLogIndex: '0', signature: `0x${'1'.repeat(130)}` });
    expect(parseProof(json)).toEqual({ kind: 'erc20', chainId: '11155111', transactionHash: HASH, receiptLogIndex: '0', signature: `0x${'1'.repeat(130)}` });
    expect(JSON.parse(json)).toMatchObject({ type: 'erc20-transfer-eip712', chain_id: '11155111' });
  });

  it('refuses anything else', () => {
    for (const bad of ['nope', '{}', '{"type":"bitcoin-onchain-tx","network":"mainnet","txid":"' + TXID + '"}', '{"type":"bitcoin-onchain-tx","network":"mutinynet","txid":"xyz"}']) {
      expect(parseProof(bad)).toBeUndefined();
    }
    expect(parseProof(JSON.stringify({ type: 'erc20-transfer-eip712', chain_id: '11155111', transaction_hash: HASH, receipt_log_index: '01', signature: `0x${'1'.repeat(130)}` }))).toBeUndefined();
  });

  it("reads Bitkit's Bitcoin proof as the same payment", () => {
    const bitkit = `{"data":"${TXID}","type":"bitcoin-onchain-txid"}`;
    expect(parseProof(bitkit)).toEqual({ kind: 'btc', txid: TXID });
    expect(transferKey(parseProof(bitkit)!)).toBe(transferKey(parseProof(btcProofJson(TXID))!));
    for (const data of [TXID.toUpperCase(), 'xyz', 7]) {
      expect(parseProof(JSON.stringify({ data, type: 'bitcoin-onchain-txid' }))).toBeUndefined();
    }
  });

  it('keys a transfer by chain, hash and log', () => {
    expect(transferKey({ kind: 'btc', txid: TXID })).toBe(`bitcoin:${TXID}`);
    expect(transferKey({ kind: 'erc20', chainId: '1', transactionHash: HASH, receiptLogIndex: '2', signature: '' })).toBe(`ethereum:1:${HASH}:2`);
  });
});

describe('Bitcoin proofs on a Bitkit regtest build', () => {
  /** Loads the module as a bitkit-regtest build would, then restores the variable. */
  function loadOnRegtest(): typeof import('../paymentProofs') {
    return withBtcChain('bitkit-regtest', () => jest.requireActual<typeof import('../paymentProofs')>('../paymentProofs'));
  }
  const regtest = loadOnRegtest();

  it("sends exactly Bitkit's proof: two keys, sorted, lowercase txid", () => {
    expect(regtest.btcProofJson(TXID.toUpperCase())).toBe(`{"data":"${TXID}","type":"bitcoin-onchain-txid"}`);
  });

  it("reads Bitkit's format", () => {
    expect(regtest.parseProof(regtest.btcProofJson(TXID))).toEqual({ kind: 'btc', txid: TXID });
  });

  it('refuses a proof that names Mutinynet: that transaction is not on this chain', () => {
    expect(regtest.parseProof(btcProofJson(TXID))).toBeUndefined();
    expect(regtest.parseProof(JSON.stringify({ type: 'bitcoin-onchain-tx', network: 'mutinynet', txid: TXID }))).toBeUndefined();
    expect(regtest.proofTransactionHash(btcProofJson(TXID))).toBeUndefined();
  });

  it('leaves the Mutinynet build sending its own format', () => {
    expect(JSON.parse(btcProofJson(TXID))).toEqual({ type: 'bitcoin-onchain-tx', network: 'mutinynet', txid: TXID });
  });
});

describe('verifyBtcProof', () => {
  const context = { amount: 10_000n, address: 'tb1q', paymentKey: 'k1', nowMs: NOW };
  it('waits for a transaction it has not seen or that is unconfirmed', () => {
    expect(verifyBtcProof({ found: false, received: 0n, confirmed: false }, context).status).toBe('pending');
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: false }, context).status).toBe('pending');
  });
  it('verifies a confirmed payment of at least the amount', () => {
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: true }, context).status).toBe('verified');
    expect(verifyBtcProof({ found: true, received: 20_000n, confirmed: true }, context).status).toBe('verified');
  });
  it('rejects too little, and a transaction that already paid something else', () => {
    expect(verifyBtcProof({ found: true, received: 9_999n, confirmed: true }, context).status).toBe('rejected');
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: true }, { ...context, transferClaimedBy: 'k2' }).status).toBe('rejected');
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: true }, { ...context, transferClaimedBy: 'k1' }).status).toBe('verified');
  });
});

describe('verifyErc20Proof', () => {
  const payer = Wallet.createRandom();
  const binding: Erc20RequestBinding = {
    payer: 'payerkey',
    payee: 'payeekey',
    paymentAppId: 'wdk-paykit-demo',
    paymentRequestId: 'b7f9c2a1-6d43-4b0e-a8d4-0fe2c712ab33',
    paymentReference: 'pkw-1',
    paymentEndpointIdentifier: 'usdt-sepolia-address',
    periodStartsAt: '',
    periodEndsAt: '',
    conversionQuoteId: '',
  };
  const transferLog = (from: string, to = PAYEE_EVM, amount = 5_000_000n, token = SEPOLIA_USDT) => ({
    address: token,
    topics: [ERC20_TRANSFER_TOPIC, pad(from), pad(to)],
    data: `0x${amount.toString(16).padStart(64, '0')}`,
  });
  const mined = (logs: ReturnType<typeof transferLog>[]): EvmTransaction => ({ state: 'succeeded', confirmations: 1, logs });

  async function proofFor(signer: HDNodeWallet, logIndex = '1', signedBinding = binding) {
    const typed = erc20PaymentTypedData(SEPOLIA_CHAIN_ID, { transactionHash: HASH, receiptLogIndex: logIndex, request: signedBinding });
    const signature = (await signer.signTypedData(typed.domain, typed.types, typed.message)).toLowerCase();
    return { kind: 'erc20' as const, chainId: String(SEPOLIA_CHAIN_ID), transactionHash: HASH, receiptLogIndex: logIndex, signature };
  }

  const context = async (overrides: object = {}) => ({
    amount: 5_000_000n,
    address: PAYEE_EVM,
    paymentKey: 'k1',
    nowMs: NOW,
    token: SEPOLIA_USDT,
    chainId: SEPOLIA_CHAIN_ID,
    paymentTime: EVM_CHAIN.paymentTime,
    binding,
    proof: await proofFor(payer),
    ...overrides,
  });
  // Log 0 is something else (e.g. a fee transfer), log 1 is the payment.
  const otherLog = { address: SEPOLIA_USDT, topics: [ERC20_TRANSFER_TOPIC], data: '0x' };

  it('verifies a signed transfer from the signer to us', async () => {
    expect(verifyErc20Proof(mined([otherLog as never, transferLog(payer.address)]), await context())).toEqual({ status: 'verified' });
  });

  it('rejects an older transfer from the payer that was never tied to this request', async () => {
    const minedHoursAgo: EvmTransaction = { state: 'succeeded', confirmations: 1_000, logs: [otherLog as never, transferLog(payer.address)] };
    const notBefore = { ms: NOW - 60 * 60_000, what: 'request' as const };
    // 1000 confirmations: mined at least 999 slots (about 3.3 h) ago, before we asked an hour ago.
    expect(verifyErc20Proof(minedHoursAgo, await context({ notBefore }))).toEqual({ status: 'rejected', reason: 'It was paid before you asked for it.' });
    // 100 confirmations (at most 20 min ago): it may well be newer, so it passes.
    expect(verifyErc20Proof({ ...minedHoursAgo, confirmations: 100 }, await context({ notBefore })).status).toBe('verified');
  });

  it('waits while the transaction is not mined', async () => {
    expect(verifyErc20Proof({ state: 'pending' }, await context()).status).toBe('pending');
    expect(verifyErc20Proof({ state: 'unknown' }, await context()).status).toBe('pending');
  });

  it('rejects a reverted transaction', async () => {
    expect(verifyErc20Proof({ state: 'failed', confirmations: 1 }, await context()).status).toBe('rejected');
  });

  it('waits on a "dropped" transaction instead of rejecting it (a lagging RPC node says the same about a mined one)', async () => {
    expect(verifyErc20Proof({ state: 'dropped' }, await context())).toMatchObject({ status: 'pending', recheckMs: 60_000 });
  });

  it('rejects a signature from someone other than the sender (a public transfer claimed by another)', async () => {
    const thief = Wallet.createRandom();
    const verdict = verifyErc20Proof(mined([otherLog as never, transferLog(payer.address)]), await context({ proof: await proofFor(thief) }));
    expect(verdict).toEqual({ status: 'rejected', reason: 'The signature is not from the account that paid.' });
  });

  it('rejects a signature over another request', async () => {
    const proof = await proofFor(payer, '1', { ...binding, paymentRequestId: 'another' });
    expect(verifyErc20Proof(mined([otherLog as never, transferLog(payer.address)]), await context({ proof })).status).toBe('rejected');
  });

  it('rejects the wrong log, token, recipient, amount, chain or a reused transfer', async () => {
    const tx = mined([otherLog as never, transferLog(payer.address)]);
    expect(verifyErc20Proof(tx, await context({ proof: await proofFor(payer, '0') })).status).toBe('rejected');
    expect(verifyErc20Proof(mined([otherLog as never, transferLog(payer.address, PAYEE_EVM, 5_000_000n, `0x${'9'.repeat(40)}`)]), await context()).status).toBe('rejected');
    expect(verifyErc20Proof(mined([otherLog as never, transferLog(payer.address, `0x${'8'.repeat(40)}`)]), await context()).status).toBe('rejected');
    expect(verifyErc20Proof(mined([otherLog as never, transferLog(payer.address, PAYEE_EVM, 4_999_999n)]), await context()).status).toBe('rejected');
    expect(verifyErc20Proof(tx, await context({ chainId: 1 })).status).toBe('rejected');
    expect(verifyErc20Proof(tx, await context({ transferClaimedBy: 'k2' })).status).toBe('rejected');
  });

  describe("on a 'block-timestamp' chain (Arbitrum)", () => {
    const paymentTime = 'block-timestamp' as const;
    const notBefore = { ms: NOW - 60 * 60_000, what: 'request' as const };
    const minedAt = (blockTimeMs: number | undefined, confirmations = 1): EvmTransaction => ({
      state: 'succeeded',
      confirmations,
      logs: [otherLog as never, transferLog(payer.address)],
      blockTimeMs,
    });

    it('verifies a fresh payment however many blocks came after it', async () => {
      // On Sepolia's rule, 5000 confirmations would mean "mined over 16 h ago".
      expect(verifyErc20Proof(minedAt(NOW - 30_000, 5_000), await context({ notBefore, paymentTime }))).toEqual({ status: 'verified' });
    });

    it('rejects a payment from before we asked, allowing for clock drift', async () => {
      expect(verifyErc20Proof(minedAt(notBefore.ms - 11 * 60_000), await context({ notBefore, paymentTime }))).toEqual({
        status: 'rejected',
        reason: 'It was paid before you asked for it.',
      });
      expect(verifyErc20Proof(minedAt(notBefore.ms - 9 * 60_000), await context({ notBefore, paymentTime })).status).toBe('verified');
    });

    it('allows exactly its 10-minute window, and a too-early verdict is final', async () => {
      // Anti-replay vs sequencer lag: 10 minutes, not Bitkit's 24 h.
      expect(EVM_BLOCK_TIMESTAMP_ALLOWANCE_MS).toBe(10 * 60_000);
      const edge = notBefore.ms - EVM_BLOCK_TIMESTAMP_ALLOWANCE_MS;
      expect(verifyErc20Proof(minedAt(edge), await context({ notBefore, paymentTime })).status).toBe('verified');
      const early = verifyErc20Proof(minedAt(edge - 1), await context({ notBefore, paymentTime }));
      expect(early.status).toBe('rejected');
      expect(early).not.toHaveProperty('recheckMs');
    });

    it('waits, never verifies, while the block time is unknown', async () => {
      expect(verifyErc20Proof(minedAt(undefined), await context({ notBefore, paymentTime }))).toEqual({
        status: 'pending',
        reason: 'Checking when it was paid.',
        recheckMs: 60_000,
      });
      // A request from before the rule has no time to compare.
      expect(verifyErc20Proof(minedAt(undefined), await context({ paymentTime })).status).toBe('verified');
    });

    describe('reading the block time only when the verdict waits on it', () => {
      const reader = (blockTimeMs: number | undefined) => jest.fn(async () => blockTimeMs);

      it('reads it after every cheaper check passed, then verifies or rejects', async () => {
        const fresh = reader(NOW - 30_000);
        expect(await verifyErc20ProofReadingBlockTime(minedAt(undefined), await context({ notBefore, paymentTime }), fresh)).toEqual({ status: 'verified' });
        expect(fresh).toHaveBeenCalledTimes(1);
        const old = reader(notBefore.ms - 11 * 60_000);
        expect(await verifyErc20ProofReadingBlockTime(minedAt(undefined), await context({ notBefore, paymentTime }), old)).toEqual({
          status: 'rejected',
          reason: 'It was paid before you asked for it.',
        });
      });

      it('checks the signature on the second pass', async () => {
        const verdict = await verifyErc20ProofReadingBlockTime(
          minedAt(undefined),
          await context({ notBefore, paymentTime, proof: await proofFor(Wallet.createRandom()) }),
          reader(NOW - 30_000),
        );
        expect(verdict).toEqual({ status: 'rejected', reason: 'The signature is not from the account that paid.' });
      });

      it('stays pending, never verified, when the time cannot be read', async () => {
        const unknown = reader(undefined);
        expect(await verifyErc20ProofReadingBlockTime(minedAt(undefined), await context({ notBefore, paymentTime }), unknown)).toEqual({
          status: 'pending',
          reason: 'Checking when it was paid.',
          recheckMs: 60_000,
        });
        expect(unknown).toHaveBeenCalledTimes(1);
      });

      it('makes no call when a cheaper check already decides, or there is no time to check', async () => {
        const read = reader(NOW);
        const wrongAmount: EvmTransaction = { state: 'succeeded', confirmations: 1, logs: [otherLog as never, transferLog(payer.address, PAYEE_EVM, 1n)] };
        expect((await verifyErc20ProofReadingBlockTime(wrongAmount, await context({ notBefore, paymentTime }), read)).status).toBe('rejected');
        expect((await verifyErc20ProofReadingBlockTime({ state: 'pending' }, await context({ notBefore, paymentTime }), read)).status).toBe('pending');
        expect((await verifyErc20ProofReadingBlockTime(minedAt(undefined), await context({ paymentTime }), read)).status).toBe('verified');
        // The block time is already known.
        expect((await verifyErc20ProofReadingBlockTime(minedAt(NOW - 30_000), await context({ notBefore, paymentTime }), read)).status).toBe('verified');
        // Sepolia's slot rule needs no block time.
        expect((await verifyErc20ProofReadingBlockTime(minedAt(undefined, 100), await context({ notBefore }), read)).status).toBe('verified');
        expect(read).not.toHaveBeenCalled();
      });
    });

    it("leaves Sepolia's slot rule as it was: confirmations, not the block time", async () => {
      expect(EVM_CHAIN.paymentTime).toBe('slot-bound');
      expect(verifyErc20Proof(minedAt(NOW, 1_000), await context({ notBefore })).status).toBe('rejected');
      expect(verifyErc20Proof(minedAt(undefined, 100), await context({ notBefore })).status).toBe('verified');
    });
  });
});

describe('payment time', () => {
  const asked = { ms: NOW - 60 * 60_000, what: 'request' as const };
  const btc = { amount: 10_000n, address: 'tb1q', paymentKey: 'k1', nowMs: NOW, notBefore: asked };

  it('takes the later of when we asked and when the period began', () => {
    expect(paymentNotBefore(1_000, undefined)).toEqual({ ms: 1_000, what: 'request' });
    expect(paymentNotBefore(1_000, 5_000)).toEqual({ ms: 5_000, what: 'period' });
    expect(paymentNotBefore(5_000, 1_000)).toEqual({ ms: 5_000, what: 'request' });
    expect(paymentNotBefore(undefined, undefined)).toBeUndefined();
  });

  it('rejects a Bitcoin payment confirmed before we asked (an earlier private send, say)', () => {
    const before = { found: true, received: 10_000n, confirmed: true, blockTimeMs: asked.ms - 11 * 60_000 };
    expect(verifyBtcProof(before, btc)).toEqual({ status: 'rejected', reason: 'It was paid before you asked for it.' });
    expect(verifyBtcProof(before, { ...btc, notBefore: { ms: asked.ms, what: 'period' } })).toEqual({ status: 'rejected', reason: 'It was paid before this payment was due.' });
  });

  it('allows block timestamps and clocks to drift a little, and waits while the block time is unknown', () => {
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: true, blockTimeMs: asked.ms - 5 * 60_000 }, btc).status).toBe('verified');
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: true }, btc).status).toBe('pending');
    // A request from before the rule has no time to compare.
    expect(verifyBtcProof({ found: true, received: 10_000n, confirmed: true }, { ...btc, notBefore: undefined }).status).toBe('verified');
  });

  it('bounds a Sepolia block time from its confirmations: at most one block per 12 s slot', () => {
    expect(latestSepoliaBlockTimeMs(1, NOW)).toBe(NOW);
    expect(latestSepoliaBlockTimeMs(301, NOW)).toBe(NOW - 3_600_000);
    expect(latestSepoliaBlockTimeMs(0, NOW)).toBe(NOW);
  });
});

describe('USD₮ proofs on an Arbitrum fork build', () => {
  const fork = withEvmChain('arbitrum-fork', () => ({
    proofs: jest.requireActual<typeof import('../paymentProofs')>('../paymentProofs'),
    chain: jest.requireActual<typeof import('../../config/evmChain')>('../../config/evmChain').EVM_CHAIN,
  }));

  it("names chain 42161 in the proof, as Bitkit's do", () => {
    const json = fork.proofs.erc20ProofJson({ transactionHash: HASH, receiptLogIndex: '2', signature: `0x${'1'.repeat(130)}` });
    expect(JSON.parse(json)).toMatchObject({ type: 'erc20-transfer-eip712', chain_id: '42161' });
    expect(fork.proofs.parseProof(json)).toMatchObject({ kind: 'erc20', chainId: '42161' });
  });

  it('times payments by the block timestamp', () => {
    expect(fork.chain.paymentTime).toBe('block-timestamp');
  });
});

describe("Bitkit's proof vectors through the payee's checks", () => {
  // The fixture's key is the secp256k1 scalar 1: public test data only.
  const fixtureKey = new Wallet(`0x${'0'.repeat(63)}1`);
  const PAYMASTER = `0x${'77'.repeat(20)}`;
  const BUNDLER = `0x${'66'.repeat(20)}`;
  const ENTRY_POINT = '0x0000000071727de22e5e9d8baf0edac6f37da032';
  const USER_OPERATION_EVENT = id('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)');
  const AMOUNT = 5_000_000n;
  const BLOCK_TIME = NOW - 30_000;
  const fork = withEvmChain('arbitrum-fork', () => jest.requireActual<typeof import('../../config/evmChain')>('../../config/evmChain').EVM_CHAIN);

  type Vector = (typeof fixtures.vectors)[number];
  const vectorNamed = (name: string): Vector => fixtures.vectors.find((v) => v.name === name)!;

  const transfer = (from: string, to: string, amount: bigint) => ({
    address: ARBITRUM_USDT0,
    topics: [ERC20_TRANSFER_TOPIC, pad(from), pad(to)],
    data: `0x${amount.toString(16).padStart(64, '0')}`,
  });

  /**
   * A smart-account payment as WDK's getTransaction returns it: a bundler
   * sent the transaction (tx.from is not the payer), the EntryPoint logged
   * the user operation, and the paymaster took its USD₮0 fee, all before
   * the payee's Transfer at the vector's receiptLogIndex 2.
   */
  function bundledPayment(payer: string, transactionHash: string): EvmTransaction {
    const tx = evmTransactionFrom({
      hash: transactionHash,
      finality: 'confirmed',
      success: true,
      block: 300_000_000,
      confirmations: 3,
      receipt: {
        from: BUNDLER,
        to: ENTRY_POINT,
        status: 1,
        blockNumber: 300_000_000,
        blockHash: `0x${'ab'.repeat(32)}`,
        logs: [
          { address: ENTRY_POINT, topics: [USER_OPERATION_EVENT, `0x${'22'.repeat(32)}`, pad(payer), pad(PAYMASTER)], data: '0x' },
          transfer(payer, PAYMASTER, 12_345n),
          transfer(payer, PAYEE_EVM, AMOUNT),
        ],
      },
    });
    // The bridge adds the block time it read from the RPC.
    return tx.state === 'succeeded' ? { ...tx, blockTimeMs: BLOCK_TIME } : tx;
  }

  function checkVector(vector: Vector, transaction: EvmTransaction, proof: { chainId: string; signature: string }, chainId: number) {
    const message = vector.typed_data.message;
    // As Bitkit sends it: its own key names, sorted.
    const parsed = parseProof(
      JSON.stringify({
        chain_id: proof.chainId,
        receipt_log_index: message.receiptLogIndex,
        signature: proof.signature,
        transaction_hash: message.transactionHash,
        type: 'erc20-transfer-eip712',
      }),
    );
    if (parsed?.kind !== 'erc20') throw new Error('The proof did not parse');
    return verifyErc20Proof(transaction, {
      amount: AMOUNT,
      address: PAYEE_EVM,
      paymentKey: 'k1',
      nowMs: NOW,
      notBefore: { ms: NOW - 60_000, what: 'request' },
      token: ARBITRUM_USDT0,
      chainId,
      paymentTime: fork.paymentTime,
      binding: message.request,
      proof: parsed,
    });
  }

  it('signs as the fixture says', () => {
    expect(fixtureKey.address).toBe(vectorNamed('one_time').signer);
  });

  it("verifies Bitkit's one_time proof for a payment sent through a bundler", () => {
    const vector = vectorNamed('one_time');
    const tx = bundledPayment(vector.signer, vector.typed_data.message.transactionHash);
    expect(checkVector(vector, tx, { chainId: '42161', signature: vector.signature }, 42161)).toEqual({ status: 'verified' });
  });

  it("rejects it when the payee's Transfer is from anyone but the signer, such as the bundler", () => {
    const vector = vectorNamed('one_time');
    const tx = bundledPayment(BUNDLER, vector.typed_data.message.transactionHash);
    expect(checkVector(vector, tx, { chainId: '42161', signature: vector.signature }, 42161)).toEqual({
      status: 'rejected',
      reason: 'The signature is not from the account that paid.',
    });
  });

  it.each(fixtures.chain_mismatch_cases.map((c) => [`domain ${c.domain_chain_id}, endpoint ${c.endpoint_chain_id}, proof ${c.payload_chain_id}`, c] as const))(
    'follows chain_mismatch_cases: %s',
    async (_name, mismatch) => {
      const vector = vectorNamed(mismatch.vector);
      const message = vector.typed_data.message;
      const domainChainId = Number(mismatch.domain_chain_id);
      // The vector's own signature where its domain matches; otherwise signed again over the case's domain.
      const typed = erc20PaymentTypedData(domainChainId, message as Erc20PaymentMessage);
      const signature =
        domainChainId === vector.typed_data.domain.chainId
          ? vector.signature
          : (await fixtureKey.signTypedData(typed.domain, typed.types, typed.message)).toLowerCase();
      const verdict = checkVector(vector, bundledPayment(vector.signer, message.transactionHash), { chainId: mismatch.payload_chain_id, signature }, Number(mismatch.endpoint_chain_id));
      expect(verdict.status).toBe(mismatch.valid ? 'verified' : 'rejected');
    },
  );
});
