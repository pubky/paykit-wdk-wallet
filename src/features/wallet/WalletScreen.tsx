// Wallet tab: your seal (with your photo) and published name, balances
// (BTC, USD₮, ETH as gas), the three actions, and recent activity. Tapping
// your name opens the You tab, where you edit your profile.
//
// Balances are polled every ~15 s while the app is active (pull to
// refresh). An empty USD₮ balance offers "Get test USD₮" right here, since
// that is the first thing a new demo wallet needs (on builds funded by
// Aave's faucet). Activity rows open Activity detail.
//
// A real-funds build (EXPO_PUBLIC_EVM_CHAIN=arbitrum-one) says so above the
// balances, always: its USD₮ and ETH are real, its keys are not protected
// like a real wallet's.
//
// Errors are sentences, never WDK's text: a balance that failed to load
// says so under the balances, and failed history replaces the "No activity
// yet" empty state (with "Try again") or sits above the cached rows.
//
// People: contacts pay us privately at their own Bitcoin accounts, which
// Send does not spend from. The BTC row therefore shows the spendable
// balance, and a line under it says how much came from contacts, with the
// way to Collect it (You > Bitcoin from contacts). Activity merges those
// accounts' history, and rows that involve a contact lead with their seal
// and name ("Ben paid you", ./activity/activityPeople.ts).
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AAVE_FAUCET_FUNDING, EVM_CHAIN } from '../../config/evmChain';
import type { MainTabScreenProps } from '../../navigation/types';
import { useConnectionNotice, useContactAccounts, useOwnProfile, usePaykitService } from '../../paykit';
import { ASSET_DOT_SIZE, AssetAmount, AssetDot, Button, Divider, EmptyState, Row, Screen, Text, space } from '../../ui';
import { ASSETS, formatAssetAmount, useActivity, useContactBtcBalances, useWalletBalances } from '../../wallet';
import { ActivityRow } from './activity/ActivityRow';
import { ContactAccountWatchers } from './activity/ContactAccountWatchers';
import { useActivityPeople } from './activity/useActivityPeople';
import { PersonSeal } from '../people/PersonSeal';
import { GetTestUsdtButton } from './GetTestUsdtButton';

export function WalletScreen({ navigation }: MainTabScreenProps<'Wallet'>) {
  const service = usePaykitService();
  const ownProfile = useOwnProfile();
  const notice = useConnectionNotice();
  const { balances, isRefreshing, refresh, error } = useWalletBalances();
  const activity = useActivity();
  const personFor = useActivityPeople();
  const contactAccounts = useContactAccounts();
  const contactIndices = useMemo(() => contactAccounts.map((a) => a.accountIndex), [contactAccounts]);
  const fromContacts = useContactBtcBalances(contactIndices);

  return (
    <Screen
      scroll
      edges={['top']}
      refreshing={isRefreshing}
      onRefresh={() => {
        void refresh();
        void activity.refresh();
      }}
      headerLeft={
        service ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens the You tab"
            onPress={() => navigation.navigate('Main', { screen: 'You' })}
            style={styles.identity}
            testID="wallet-identity"
          >
            <PersonSeal pubky={service.publicKey} size={36} />
            <Text variant="bodyStrong" numberOfLines={1} style={styles.name}>
              {ownProfile.displayName ?? 'You'}
            </Text>
          </Pressable>
        ) : (
          <Text color="graphite">{notice?.label}</Text>
        )
      }
      testID="wallet-screen"
    >
      {EVM_CHAIN.realFundsWarning ? (
        <Text variant="secondary" color="alert" style={styles.realFunds} testID="real-funds-warning">
          {EVM_CHAIN.realFundsWarning}
        </Text>
      ) : null}
      <View style={styles.balances}>
        <Row title={ASSETS.btc.displayName} leading={<AssetDot asset="btc" />} trailing={<AssetAmount value={balances.btc} asset="btc" />} testID="balance-btc" />
        {fromContacts.collectable > 0n ? (
          <Pressable
            accessibilityRole="button"
            accessibilityHint="Opens You, where you collect it"
            onPress={() => navigation.navigate('Main', { screen: 'You' })}
            style={styles.fromContacts}
            testID="balance-btc-contacts"
          >
            <Text variant="caption" color="graphite">
              Plus {formatAssetAmount(fromContacts.collectable, 'btc', { withSymbol: true })} from contacts.{' '}
              <Text variant="caption" color="seal">
                Collect it to spend it
              </Text>
            </Text>
          </Pressable>
        ) : null}
        <Divider />
        <Row title={ASSETS.usdt.displayName} leading={<AssetDot asset="usdt" />} trailing={<AssetAmount value={balances.usdt} asset="usdt" />} testID="balance-usdt" />
        <Text variant="caption" color="graphite" style={styles.gas} testID="balance-eth">
          gas {balances.eth === undefined ? '—' : formatAssetAmount(balances.eth, 'eth', { withSymbol: true })}
        </Text>
        {/* The button renders nothing without the faucet, but its wrapper's margin would still show. */}
        {balances.usdt === 0n && AAVE_FAUCET_FUNDING ? (
          <View style={styles.faucet}>
            <GetTestUsdtButton compact />
          </View>
        ) : null}
        {error ? (
          <Text variant="caption" color="alert" testID="balance-error">
            {error}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button label="Send" onPress={() => navigation.navigate('Send')} style={styles.action} />
        <Button label="Receive" variant="secondary" onPress={() => navigation.navigate('Receive')} style={styles.action} />
        <Button label="Request" variant="secondary" onPress={() => navigation.navigate('RequestMoney')} style={styles.action} />
      </View>

      <Text variant="heading" style={styles.sectionTitle}>
        Activity
      </Text>
      {activity.error && activity.items.length > 0 ? (
        <Text variant="caption" color="alert" testID="activity-error">
          {activity.error}
        </Text>
      ) : null}
      {activity.items.length === 0 && activity.error && !activity.isLoading ? (
        <EmptyState
          title="Couldn't load activity"
          message={activity.error}
          action={{ label: 'Try again', onPress: () => void activity.refresh() }}
        />
      ) : activity.items.length === 0 ? (
        <EmptyState
          title={activity.isLoading ? 'Loading activity…' : 'No activity yet'}
          message={activity.isLoading ? undefined : 'Receive some test funds to get started.'}
          action={activity.isLoading ? undefined : { label: 'Receive', onPress: () => navigation.navigate('Receive') }}
        />
      ) : (
        activity.items.slice(0, 20).map((item, index) => (
          <View key={item.id}>
            {index > 0 ? <Divider /> : null}
            <ActivityRow item={item} person={personFor(item)} onPress={() => navigation.navigate('ActivityDetail', { activityId: item.id })} />
          </View>
        ))
      )}
      <ContactAccountWatchers />
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexShrink: 1 },
  name: { flexShrink: 1 },
  realFunds: { marginBottom: space.m },
  balances: { gap: 0 },
  // Line up with the asset names: dot width plus the Row's gap.
  gas: { marginLeft: ASSET_DOT_SIZE + space.m, marginTop: -space.s },
  fromContacts: { marginLeft: ASSET_DOT_SIZE + space.m, marginTop: -space.s, marginBottom: space.s },
  faucet: { marginLeft: ASSET_DOT_SIZE + space.m, marginTop: space.m },
  actions: { flexDirection: 'row', gap: space.s, marginTop: space.xl },
  action: { flex: 1, paddingHorizontal: space.s },
  sectionTitle: { marginTop: space.xxl, marginBottom: space.s },
});
