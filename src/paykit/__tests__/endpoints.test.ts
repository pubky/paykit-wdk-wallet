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
  type ParsedEndpoint,
} from '../endpoints';
import { withBtcChain, withEvmChain } from '../../config/__tests__/withEnv';

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

  it('types the Bitcoin identifier as one of our endpoint ids, not any string', () => {
    const parsed: ParsedEndpoint = { identifier: ENDPOINT_BTC, asset: 'btc', address: BTC };
    // @ts-expect-error: an id that is not ours does not type-check as the Bitcoin endpoint (npm run typecheck).
    const other: ParsedEndpoint = { identifier: 'btc-bitcoin-p2wpkh', asset: 'btc', address: BTC };
    expect(parsed.identifier).not.toBe(other.identifier);
  });

  it('pays a padded or uppercase Bitcoin address as the bare lowercase address', () => {
    for (const value of [` ${BTC} `, BTC.toUpperCase(), `\n${BTC.toUpperCase()}\t`]) {
      const parsed = parseEndpoint(ENDPOINT_BTC, JSON.stringify({ value }));
      expect(parsed).toEqual({ identifier: ENDPOINT_BTC, asset: 'btc', address: BTC });
      expect(canonicalPayload(parsed!)).toBe(btcReceivingDetail(BTC).payload);
    }
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

  it('pays a padded or uppercase bcrt1 address as the bare lowercase address', () => {
    const parsed = regtest.parseEndpoint('btc-regtest-p2wpkh', JSON.stringify({ value: ` ${BCRT1.toUpperCase()} ` }));
    expect(parsed).toEqual({ identifier: 'btc-regtest-p2wpkh', asset: 'btc', address: BCRT1 });
    expect(regtest.canonicalPayload(parsed!)).toBe(regtest.btcReceivingDetail(BCRT1).payload);
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

describe('the USD₮ endpoint on an Arbitrum fork build', () => {
  // USD₮0 on Arbitrum One, in lowercase, exactly as Bitkit publishes it.
  const USDT0 = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
  const CHECKSUMMED = '0x83A881Ddad0F675A3d57d306F3F4E6b352b95CD0';
  const fork = withEvmChain('arbitrum-fork', () => jest.requireActual<typeof import('../endpoints')>('../endpoints'));
  const forkPayload = fork.usdtReceivingDetail(EVM).payload;

  it("publishes under Bitkit's endpoint id, with chain 42161 and USD₮0", () => {
    const usdt = fork.usdtReceivingDetail(EVM);
    expect(usdt.identifier).toBe('usdt-arbitrum-address');
    expect(usdt.payload).toBe(`{"value":"${EVM}","chain_id":"42161","token":"${USDT0}"}`);
    const parsed = fork.parseEndpoint(usdt.identifier, usdt.payload);
    expect(parsed).toEqual({ identifier: 'usdt-arbitrum-address', asset: 'usdt', address: EVM, chainId: '42161', token: USDT0 });
    expect(fork.canonicalPayload(parsed!)).toBe(usdt.payload);
  });

  it("pays Bitkit's own payload: sorted keys and a checksummed address", () => {
    const bitkit = `{"chain_id":"42161","token":"${USDT0}","value":"${CHECKSUMMED}"}`;
    expect(fork.parseEndpoint('usdt-arbitrum-address', bitkit)).toMatchObject({ asset: 'usdt', address: CHECKSUMMED, chainId: '42161' });
    expect(fork.payableCandidateIds([{ candidateId: 'bitkit', identifier: 'usdt-arbitrum-address', payloadText: bitkit }])).toEqual(['bitkit']);
  });

  it('refuses a Sepolia payload on Arbitrum, and an Arbitrum payload on Sepolia', () => {
    const sepoliaPayload = usdtReceivingDetail(EVM).payload;
    expect(fork.parseEndpoint('usdt-arbitrum-address', sepoliaPayload)).toBeUndefined();
    expect(fork.parseEndpoint('usdt-sepolia-address', sepoliaPayload)).toBeUndefined();
    expect(parseEndpoint(ENDPOINT_USDT, forkPayload)).toBeUndefined();
    expect(parseEndpoint('usdt-arbitrum-address', forkPayload)).toBeUndefined();
  });

  it('refuses the right token on the wrong chain id, or a chain id written another way', () => {
    for (const chainId of ['1', '0xa4b1', ' 42161', '042161']) {
      expect(fork.parseEndpoint('usdt-arbitrum-address', JSON.stringify({ value: EVM, chain_id: chainId, token: USDT0 }))).toBeUndefined();
    }
    expect(fork.parseEndpoint('usdt-arbitrum-address', JSON.stringify({ value: EVM, chain_id: '42161', token: SEPOLIA_USDT }))).toBeUndefined();
  });

  it('leaves the default build on Sepolia', () => {
    expect(ENDPOINT_USDT).toBe('usdt-sepolia-address');
  });
});
