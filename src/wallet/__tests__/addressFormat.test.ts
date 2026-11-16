// Address checks follow the build's Bitcoin network (src/config/btcChain.ts)
// and EVM chain (src/config/evmChain.ts).
import { AAVE_SEPOLIA_FAUCET } from '../../config/chains';
import { checkRecipientAddress, isKnownContract, isPayableBtcAddress, payeeOfPaymentText } from '../addressFormat';
import { withBtcChain, withEvmChain } from '../../config/__tests__/withEnv';

const TB1 = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const BCRT1 = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

/** Loads the module as a bitkit-regtest build would, then restores the variable. */
function loadOnRegtest(): typeof import('../addressFormat') {
  return withBtcChain('bitkit-regtest', () => jest.requireActual<typeof import('../addressFormat')>('../addressFormat'));
}

describe('Bitcoin addresses on a Mutinynet build', () => {
  it('pays tb1 only, not regtest bcrt1', () => {
    expect(isPayableBtcAddress(TB1)).toBe(true);
    expect(isPayableBtcAddress(BCRT1)).toBe(false);
    expect(checkRecipientAddress(BCRT1, 'bitcoin')).toMatchObject({ ok: false, message: 'This wallet sends to tb1… addresses only. Ask for a tb1… address.' });
  });

  it('calls an unreadable address not a testnet one', () => {
    expect(checkRecipientAddress('hello', 'bitcoin')).toEqual({
      ok: false,
      reason: 'invalid',
      message: 'That is not a Bitcoin testnet address. It should start with tb1.',
    });
  });
});

describe('Bitcoin addresses on a Bitkit regtest build', () => {
  const regtest = loadOnRegtest();

  it('pays bcrt1 only, not Mutinynet tb1', () => {
    expect(regtest.isPayableBtcAddress(BCRT1)).toBe(true);
    expect(regtest.isPayableBtcAddress(BCRT1.toUpperCase())).toBe(true);
    expect(regtest.isPayableBtcAddress(TB1)).toBe(false);
    expect(regtest.chainOfAddress(BCRT1)).toBe('bitcoin');
  });

  it("keeps bech32's 90-character limit with the longer bcrt1 prefix", () => {
    const longest = `bcrt1${'q'.repeat(85)}`;
    expect(longest).toHaveLength(90);
    expect(regtest.isPayableBtcAddress(longest)).toBe(true);
    expect(regtest.isPayableBtcAddress(`${longest}q`)).toBe(false);
  });

  it('accepts a bcrt1 recipient and refuses a tb1 one, naming bcrt1', () => {
    expect(regtest.checkRecipientAddress(`bitcoin:${BCRT1}`, 'bitcoin')).toEqual({ ok: true, address: BCRT1 });
    expect(regtest.checkRecipientAddress(TB1, 'bitcoin')).toEqual({
      ok: false,
      reason: 'unsupported',
      message: 'This wallet sends to bcrt1… addresses only. Ask for a bcrt1… address.',
    });
    expect(regtest.checkRecipientAddress(TB1, 'ethereum')).toMatchObject({ ok: false, reason: 'wrong-chain' });
  });

  it('calls an unreadable address not a regtest one, not a testnet one', () => {
    expect(regtest.checkRecipientAddress('hello', 'bitcoin')).toEqual({
      ok: false,
      reason: 'invalid',
      message: 'That is not a Bitcoin regtest address. It should start with bcrt1.',
    });
  });
});

describe('Ethereum payment codes on an Arbitrum fork build', () => {
  const USDT0 = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
  const PAYEE = '0x83A881Ddad0F675A3d57d306F3F4E6b352b95CD0';
  // What Bitkit's USD₮ receive QR code holds.
  const BITKIT_CODE = `ethereum:${USDT0}@42161/transfer?address=${PAYEE}`;
  const fork = withEvmChain('arbitrum-fork', () => jest.requireActual<typeof import('../addressFormat')>('../addressFormat'));

  it("pays the address in Bitkit's code on Arbitrum, and refuses it on Sepolia", () => {
    expect(fork.payeeOfPaymentText(BITKIT_CODE)).toEqual({ ok: true, address: PAYEE });
    expect(fork.checkRecipientAddress(BITKIT_CODE, 'ethereum')).toEqual({ ok: true, address: PAYEE });
    expect(payeeOfPaymentText(BITKIT_CODE)).toEqual({ ok: false, message: 'That code is for another Ethereum network. This wallet pays on Sepolia only.' });
  });

  it('refuses a Sepolia code on Arbitrum', () => {
    expect(fork.payeeOfPaymentText(`ethereum:${PAYEE}@11155111`)).toEqual({
      ok: false,
      message: 'That code is for another Ethereum network. This wallet pays on Arbitrum only.',
    });
  });

  it('never pays the USD₮0 contract, and has no Aave faucet to guard', () => {
    expect(fork.isKnownContract(USDT0)).toBe(true);
    expect(fork.checkRecipientAddress(`ethereum:${USDT0}@42161`, 'ethereum')).toEqual({
      ok: false,
      reason: 'contract',
      message: "That is the USD₮ token contract, not someone's wallet. Money sent there is lost. Paste the payee's own address.",
    });
    expect(checkRecipientAddress(AAVE_SEPOLIA_FAUCET, 'ethereum')).toMatchObject({
      message: "That is the test USD₮ token or faucet contract, not someone's wallet. Money sent there is lost. Paste the payee's own address.",
    });
    expect(fork.isKnownContract(AAVE_SEPOLIA_FAUCET)).toBe(false);
    expect(isKnownContract(AAVE_SEPOLIA_FAUCET)).toBe(true);
  });
});

describe('the unknown-token message per build', () => {
  const PAYEE = '0x83A881Ddad0F675A3d57d306F3F4E6b352b95CD0';
  const OTHER_TOKEN = '0x1111111111111111111111111111111111111111';
  const load = () => jest.requireActual<typeof import('../addressFormat')>('../addressFormat');
  const otherToken = (format: typeof import('../addressFormat'), chainId: number) =>
    format.payeeOfEthereumUri(`${OTHER_TOKEN}@${chainId}/transfer?address=${PAYEE}`);

  it('says test USD₮ on Sepolia and USD₮0 on the local fork', () => {
    expect(otherToken(load(), 11155111)).toEqual({
      ok: false,
      message: 'That code asks for a token this wallet does not hold. It pays test USD₮ only.',
    });
    expect(otherToken(withEvmChain('arbitrum-fork', load), 42161)).toEqual({
      ok: false,
      message: 'That code asks for a token this wallet does not hold. It pays USD₮0 only.',
    });
  });
});
