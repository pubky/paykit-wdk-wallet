// You > Test funds: where demo money comes from.
//
// - USD₮: "Get test USD₮" mints Aave's Sepolia test token from this wallet
//   (needs a little Sepolia ETH for gas; the button says so when there is
//   none).
// - ETH for gas and Mutinynet bitcoin come from public faucets, which need a
//   person (a login or a captcha), so this section links to them
//   (src/config/chains.ts). Every "Not enough ETH for gas" message points
//   here. The demo scripts in scripts/fund-*.mjs do the same from a laptop.
// - Bitkit's regtest (src/config/btcChain.ts `funding`) has no faucet. Its bitcoin
//   comes from Blocktank's regtest deposit, which scripts/fund-btc.mjs
//   calls from a laptop and Bitkit's Dev Settings call from the phone, so
//   this section says so and shows the address to fund.
// - The local Arbitrum fork (src/config/evmChain.ts `funding`) has no
//   faucet either: scripts/fund-fork.mjs sets its USD₮0 and ETH balances
//   from the computer that runs it, so the section says so and shows the
//   address.
//
// One Ethereum address holds both ETH and USD₮, so the text calls it "your
// Ethereum address" and says once that USD₮ arrives there too.
import { Linking, StyleSheet, View } from 'react-native';

import { BTC_CHAIN, type BtcFunding } from '../../config/btcChain';
import { EVM_CHAIN, type EvmFunding } from '../../config/evmChain';
import { Button, KeyText, Text, space } from '../../ui';
import { formatFee, useWalletAddresses, useWalletBalances } from '../../wallet';
import { GetTestUsdtButton } from '../wallet/GetTestUsdtButton';

export function TestFundsSection() {
  const { btc, evm } = useWalletAddresses();
  const { balances } = useWalletBalances();
  const gas = balances.eth === undefined ? '—' : formatFee(balances.eth, 'eth');
  return (
    <View style={styles.root}>
      <EvmTestFunds funding={EVM_CHAIN.funding} address={evm} gas={gas} />
      <BtcTestFunds funding={BTC_CHAIN.funding} address={btc} />
    </View>
  );
}

function EvmTestFunds({ funding, address, gas }: { funding: EvmFunding; address?: string; gas: string }) {
  const addressText = address ? <KeyText value={address} small testID="you-evm-address" /> : null;
  switch (funding.kind) {
    case 'aave-faucet':
      return (
        <>
          <GetTestUsdtButton compact faucetBelow />
          <Text color="graphite" variant="secondary">
            Gas: {gas}. {EVM_CHAIN.gasCoin} comes from a public faucet. Ask it to send
            to your Ethereum address (USD₮ arrives there too):
          </Text>
          {addressText}
          <Button
            label={`Open a ${EVM_CHAIN.gasCoin} faucet`}
            variant="secondary"
            compact
            onPress={() => void Linking.openURL(funding.ethFaucetUrl)}
            testID="open-eth-faucet"
          />
        </>
      );
    case 'anvil-fork':
      return (
        <>
          <Text color="graphite" variant="secondary">
            Gas: {gas}. The local fork has no faucet. Its USD₮0 and ETH come from running node scripts/fund-fork.mjs with this address on
            your computer:
          </Text>
          {addressText}
        </>
      );
  }
}

function BtcTestFunds({ funding, address }: { funding: BtcFunding; address?: string }) {
  switch (funding.kind) {
    case 'faucet':
      return <BtcFaucet url={funding.url} />;
    case 'blocktank-regtest':
      return <BtcRegtestDeposit address={address} />;
  }
}

function BtcFaucet({ url }: { url: string }) {
  return (
    <>
      <Text color="graphite" variant="secondary">
        Test bitcoin comes from the {BTC_CHAIN.displayName} faucet (GitHub login).
      </Text>
      <Button label={`Open the ${BTC_CHAIN.displayName} faucet`} variant="secondary" compact onPress={() => void Linking.openURL(url)} />
    </>
  );
}

function BtcRegtestDeposit({ address }: { address?: string }) {
  return (
    <>
      <Text color="graphite" variant="secondary">
        Regtest has no faucet. Test bitcoin comes from Blocktank’s regtest deposit: run node scripts/fund-btc.mjs --chain bitkit-regtest
        with this address on your computer, or use Bitkit’s Dev Settings. A block comes only when someone mines one.
      </Text>
      {address ? <KeyText value={address} small testID="you-btc-address" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  root: { gap: space.m, alignItems: 'flex-start' },
});
