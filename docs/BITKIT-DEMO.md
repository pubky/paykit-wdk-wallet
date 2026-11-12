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

The wallet reads both proof formats in every build.

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

**Debug (Metro).** Start Metro with the variable, and clear its cache so
no bundle from the other mode is reused:

```sh
npm run start:bitkit-regtest
# same as: EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest npx expo start --dev-client --clear
```

The native Debug build is the same in both modes: build it as usual with
`--no-bundler` (see [README](../README.md), "Run it"), then open the dev
client on this Metro server. To go back to Mutinynet, stop Metro and run
`npx expo start --dev-client --clear`.

**Release builds** bundle the JavaScript at build time. Set the variable
for the build command:

```sh
EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest npx expo run:ios --configuration Release --device "<simulator>" --no-bundler
```

### Use a separate install per chain mode

Run each chain mode in its own app install, on its own simulator. Do not
switch an existing install between modes. WDK's balance cache and the
app's Paykit state (contacts, requests, ledger) are stored per install,
and they do not know which chain they came from. On iOS, Keychain items
also survive an uninstall, so erase the simulator to start clean.

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
never prints a secret. A regtest Debug build uses this identity on any
platform. Release builds never contain the prefill.

## Fund and mine

Regtest has no faucet. Blocktank's staging API makes coins on request.
`scripts/fund-btc.mjs` sends the deposit and then mines one block, so
the coins confirm at once:

```sh
node scripts/fund-btc.mjs --chain bitkit-regtest bitkit-regtest 100000   # the demo identity
node scripts/fund-btc.mjs --chain bitkit-regtest bcrt1q… 50000           # any regtest address
node scripts/fund-btc.mjs --chain bitkit-regtest --mine 1                # mine a block
```

The script prints the funding transaction with an explorer link. The
`bitkit-regtest` target is the first Bitcoin address of the identity in
`BITKIT_REGTEST_MNEMONIC`, derived as WDK derives it. If
`EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest` is set in your shell, you can leave
out `--chain`.

A payment stays pending until the next block. On regtest, nobody mines
on a schedule. After a payment, mine a block with `--mine 1`, or from
Bitkit.

You can also fund and mine from Bitkit: Settings › Dev Settings ›
Blocktank Regtest.

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
