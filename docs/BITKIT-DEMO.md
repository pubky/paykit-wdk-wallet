# Run the wallet with Bitkit on regtest

This guide runs the wallet on Bitkit's staging regtest, next to a stock
Bitkit iOS Debug build. Use it to demo Paykit between this wallet and
Bitkit.

> This mode is for a demo. The results of checking it against Bitkit, and
> what does not work yet, are in the pull request that added it. This
> guide does not claim that every payment path works end to end.

## Why a second chain mode

Paykit only helps two wallets pay each other when they use the same
Bitcoin network. By default this wallet runs on Mutinynet, a signet. A
Bitkit Debug build runs on regtest, on Blocktank's staging servers. So
this wallet has a build-time switch that moves its Bitcoin side to that
regtest.

## What changes in this mode

The switch is `EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest`
([`src/config/btcChain.ts`](../src/config/btcChain.ts)). Leave it unset
for Mutinynet. Any other value stops the app at launch.

| | Default (Mutinynet) | `bitkit-regtest` |
|---|---|---|
| WDK network | `testnet` (tb1…) | `regtest` (bcrt1…) |
| Electrum | `tcp://electrum.mutinynet.com:50001` | `tls://electrs.bitkit.stag0.blocktank.to:9999` |
| Fee rates and block times (esplora) | `https://mutinynet.com/api` | `https://mempool.bitkit.stag0.blocktank.to/api` |
| Explorer | `https://mutinynet.com` | `https://mempool.bitkit.stag0.blocktank.to` |
| Bitcoin endpoint id | `btc-mutinynet-p2wpkh` | `btc-regtest-p2wpkh` (Bitkit's id) |
| Bitcoin payment proof sent | this wallet's own format | Bitkit's format (`bitcoin-onchain-txid`) |
| Blocks | every 30 seconds | only when someone mines one |
| Test bitcoin | Mutinynet faucet | Blocktank's regtest deposit |

Every build reads Bitkit's `bitcoin-onchain-txid` proof. Only Mutinynet
builds also read this wallet's own Mutinynet proof. A regtest build refuses
that proof on purpose: it names Mutinynet, so its transaction could never
be found on regtest.

These do not change:

- **USD₮ stays on Ethereum Sepolia** (`usdt-sepolia-address`). Bitkit's
  USD₮ runs on Arbitrum One only, so Bitkit skips this endpoint. Only
  Bitcoin moves between the two wallets.
- **No Lightning.** This wallet pays on chain only. Bitkit may also
  publish Lightning endpoints; this wallet ignores them.
- **The Pubky side.** Both apps use the same Pubky staging homeserver.

You > Network details shows the active Electrum server and esplora API.
In regtest mode it also shows the chain mode.

## Build and run

Expo puts `EXPO_PUBLIC_*` variables into the JavaScript bundle when Metro
builds it. So the variable must be set when the bundle is built.

**Debug (Metro).** Start Metro with the variable:

```sh
npm run start:bitkit-regtest
# same as: EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest npx expo start --dev-client --clear
```

The native Debug build is the same in both modes: build it as usual with
`--no-bundler` (see [README](../README.md), "Run it"), then open the dev
client on this Metro server. To go back to Mutinynet, stop Metro, run
`npm start`, and use a Mutinynet install on its own simulator (or erase
the simulator first). Do not reload the regtest install on the Mutinynet
bundle; see "Use a separate install per chain mode" below.

Switching modes does not need a cache clear; the `--clear` in
`start:bitkit-regtest` only makes sure. Checked in Expo SDK 55
(`babel-preset-expo` 55.0.25, `@expo/metro-config` 55.0.27,
`@expo/cli` 55.0.36):

- Metro's transform cache key does not include `EXPO_PUBLIC_*` values.
- In a Debug bundle, Babel does not put the value into the transformed
  file. It rewrites `process.env.EXPO_PUBLIC_BTC_CHAIN` to a lookup in
  `expo/virtual/env` (`babel-preset-expo/build/inline-env-vars.js`).
  Metro then adds the current values to each bundle it serves, from its
  own environment (`environmentVariableSerializerPlugin.js`). So the
  value comes from the Metro process that is running, and a cached
  transform never holds it.
- A Release bundle does contain the value. A Release
  `npx expo run:ios` resets Metro's cache before it bundles, outside CI
  (`exportEager.js`: `resetCache = !CI`), so a stale value is not reused.

**Release builds** bundle the JavaScript at build time. Set the variable
for the build command:

```sh
EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest npx expo run:ios --configuration Release --device "<simulator>" --no-bundler
```

### Use a separate install per chain mode

Run each chain mode in its own app install, on its own simulator. Do not
switch an existing install between modes. WDK's balance cache and the
app's Paykit state (contacts, requests, ledger) are stored per install,
and they do not know which chain they came from. Old payment proofs in
the other mode's format also stop parsing, so a proof could be sent again.
On iOS, Keychain items also survive an uninstall, so erase the simulator
to start clean.

## The demo identity

The regtest build uses its own identity, not the Mutinynet demo phones'.
Put these keys in the git-ignored `.env.demo`:

| Key | What it is |
|---|---|
| `BITKIT_REGTEST_MNEMONIC` | The BIP-39 phrase of the regtest identity |
| `BITKIT_REGTEST_SIGNUP_CODE` | A single-use Pubky staging signup code, for its first sign-up |
| `BITKIT_REGTEST_PEER_PUBKY` | Optional: Bitkit's pubky, to prefill the peer field |

Then write the dev prefill:

```sh
node scripts/demo-env.mjs
```

The script writes `src/config/demo.local.ts` (git-ignored, mode 600) and
never prints a secret. A regtest Debug build uses this identity on iOS
only, because the Bitkit demo runs on iOS. A regtest build on Android gets
no prefill: one identity on two devices at once would split its contacts,
ledger and Allowances. Release builds never contain the prefill.

## Fund and mine

Regtest has no faucet. Blocktank's staging API makes coins on request.
`scripts/fund-btc.mjs` sends the deposit and then mines one block, so
the coins confirm at once.

Staging's regtest routes need HTTP basic auth. Put the credentials in
the git-ignored `.env.demo`, never in a tracked file:

| Key | What it is |
|---|---|
| `BLOCKTANK_REGTEST_AUTH` | `user:password` for Blocktank's staging `/regtest/*` routes |

It is a Synonym team secret (Bitkit's CI keeps it as a GitHub secret);
ask the Bitkit team for it. The script reads it from the environment
first, then from `.env.demo`, and sends it on every deposit and mine. It
never prints the value. If the key is missing, or Blocktank refuses it
(401 or 403), the script stops and says where to put it.

```sh
node scripts/fund-btc.mjs --chain bitkit-regtest bitkit-regtest 100000   # the demo identity
node scripts/fund-btc.mjs --chain bitkit-regtest bcrt1q… 50000           # any regtest address
node scripts/fund-btc.mjs --chain bitkit-regtest --mine 1                # mine a block
```

The script prints the funding transaction with an explorer link. The
`bitkit-regtest` target is the first Bitcoin address of the identity in
`BITKIT_REGTEST_MNEMONIC`, derived as WDK derives it.

The scripts pick the chain only from `--chain`; without it they use
Mutinynet. Do not export `EXPO_PUBLIC_BTC_CHAIN` in your shell: `npm start`
would then bundle regtest, and `npm test` would fail.

If Blocktank accepts the deposit but the script cannot read a transaction
id in the reply, it prints a warning with the reply and still mines the
block. Check the address in the explorer before you fund again.

If the deposit goes through but mining its block fails, the script says
the deposit was sent and exits with an error. Do not fund again: mine the
block with `--mine 1`.

To check the identity's balance (confirmed and unconfirmed):

```sh
node scripts/fund-status.mjs --chain bitkit-regtest              # account 0
node scripts/fund-status.mjs --chain bitkit-regtest --contacts 3 # plus contact accounts 1..3
```

A payment stays pending until the next block. On regtest, nobody mines
on a schedule. After a payment, mine a block with `--mine 1`, or from
Bitkit.

You can also fund and mine from Bitkit: Settings › Dev Settings ›
Blocktank Regtest. Bitkit needs the same `BLOCKTANK_REGTEST_AUTH` value,
passed to the app when it launches. Debug builds read it from the process
environment or from a launch argument:

```sh
SIMCTL_CHILD_BLOCKTANK_REGTEST_AUTH='user:password' xcrun simctl launch <udid> to.bitkit
# or: xcrun simctl launch <udid> to.bitkit -BLOCKTANK_REGTEST_AUTH=user:password
```

## Set up Bitkit

1. Build and run a **Debug** build of
   [bitkit-ios](https://github.com/synonymdev/bitkit-ios) `master`. Debug
   builds use the staging regtest.
2. Create a wallet.
3. Create a Pubky profile.
4. In Settings › General, turn on **Public payments** and **Private
   contact payments**.
5. Copy Bitkit's pubky into `BITKIT_REGTEST_PEER_PUBKY` if you want it
   prefilled, and run `node scripts/demo-env.mjs` again.

Then add each other as contacts and pay as in [DEMO.md](DEMO.md), with
Bitcoin only.
