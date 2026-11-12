import { ENDPOINT_BTC, ENDPOINT_USDT } from '../../config/paykit';
import { SEPOLIA_USDT } from '../../config/chains';
import {
  PRIVATE_MESSAGE_LIMIT_BYTES,
  btcReceivingDetail,
  canonicalPayload,
  parseEndpoint,
  payableCandidateIds,
  usdtReceivingDetail,
  utf8ByteLength,
} from '../endpoints';
import { withBtcChain } from '../../config/__tests__/withBtcChain';

const EVM = '0x00000000000000000000000000000000000000aa';
const BTC = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

describe('endpoint payloads', () => {
  it('builds compact payloads that round-trip through the parser', () => {
    const usdt = usdtReceivingDetail(EVM);
    const btc = btcReceivingDetail(BTC);
    expect(JSON.parse(usdt.payload)).toEqual({ value: EVM, chain_id: '11155111', token: SEPOLIA_USDT });
    const parsedUsdt = parseEndpoint(usdt.identifier, usdt.payload);
    const parsedBtc = parseEndpoint(btc.identifier, btc.payload);
    expect(parsedUsdt?.asset).toBe('usdt');
    expect(parsedBtc).toEqual({ identifier: ENDPOINT_BTC, asset: 'btc', address: BTC });
    expect(canonicalPayload(parsedUsdt!)).toBe(usdt.payload);
    // Both endpoints together stay far below the private message limit.
    expect(utf8ByteLength(usdt.payload + btc.payload)).toBeLessThan(PRIVATE_MESSAGE_LIMIT_BYTES / 4);
  });

  it('rejects payloads for the wrong chain, token or address format', () => {
    const wrongChain = JSON.stringify({ value: EVM, chain_id: '1', token: SEPOLIA_USDT });
    const wrongToken = JSON.stringify({ value: EVM, chain_id: '11155111', token: '0x' + '1'.repeat(40) });
    expect(parseEndpoint(ENDPOINT_USDT, wrongChain)).toBeUndefined();
    expect(parseEndpoint(ENDPOINT_USDT, wrongToken)).toBeUndefined();
    expect(parseEndpoint(ENDPOINT_BTC, JSON.stringify({ value: 'bc1qmainnetaddress00000000000000000' }))).toBeUndefined();
    expect(parseEndpoint(ENDPOINT_BTC, 'not json')).toBeUndefined();
    expect(parseEndpoint('btc-bitcoin-p2wpkh', btcReceivingDetail(BTC).payload)).toBeUndefined();
  });

  it('accepts the token address in any letter case', () => {
    const lower = JSON.stringify({ value: EVM, chain_id: '11155111', token: SEPOLIA_USDT.toLowerCase() });
    expect(parseEndpoint(ENDPOINT_USDT, lower)?.asset).toBe('usdt');
  });

  it('orders payable candidates USD₮ first and drops unpayable ones', () => {
    const ids = payableCandidateIds([
      { candidateId: 'b', identifier: ENDPOINT_BTC, payloadText: btcReceivingDetail(BTC).payload },
      { candidateId: 'x', identifier: 'eur-sepa-iban', payloadText: '{"value":"DE00"}' },
      { candidateId: 'u', identifier: ENDPOINT_USDT, payloadText: usdtReceivingDetail(EVM).payload },
      { candidateId: 'bad', identifier: ENDPOINT_USDT, payloadText: '{"value":"0x12"}' },
    ]);
    expect(ids).toEqual(['u', 'b']);
  });
});

describe('the Bitcoin endpoint on a Bitkit regtest build', () => {
  const BCRT1 = 'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

  /** Loads the module as a bitkit-regtest build would, then restores the variable. */
  function loadOnRegtest(): typeof import('../endpoints') {
    return withBtcChain('bitkit-regtest', () => jest.requireActual<typeof import('../endpoints')>('../endpoints'));
  }
  const regtest = loadOnRegtest();

  it("publishes a bcrt1 address under Bitkit's endpoint id", () => {
    const btc = regtest.btcReceivingDetail(BCRT1);
    expect(btc.identifier).toBe('btc-regtest-p2wpkh');
    expect(regtest.parseEndpoint(btc.identifier, btc.payload)).toEqual({ identifier: 'btc-regtest-p2wpkh', asset: 'btc', address: BCRT1 });
  });

  it('pays neither a Mutinynet endpoint nor a tb1 address', () => {
    expect(regtest.parseEndpoint(ENDPOINT_BTC, JSON.stringify({ value: BTC }))).toBeUndefined();
    expect(regtest.parseEndpoint('btc-regtest-p2wpkh', JSON.stringify({ value: BTC }))).toBeUndefined();
  });

  it('leaves the Mutinynet build on its own endpoint id', () => {
    expect(ENDPOINT_BTC).toBe('btc-mutinynet-p2wpkh');
    expect(parseEndpoint('btc-regtest-p2wpkh', JSON.stringify({ value: BCRT1 }))).toBeUndefined();
  });
});
