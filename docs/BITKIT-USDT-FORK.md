# Pay USD₮ with Bitkit on a local Arbitrum fork

This guide runs the wallet's USD₮ on a private copy of Arbitrum One on
your Mac, next to a stock Bitkit iOS Debug build pointed at the same
copy. Use it to demo Paykit USD₮ payments between this wallet and Bitkit
without spending real money.

> **Not run yet.** Nothing in this guide has been run against a live
> fork. The wallet's side is covered by unit tests only. The biggest
> open question is whether Bitkit can *send* USD₮ on the fork through
> bitkit-core's test bundler (see "Start the bundler and paymaster").
> Until someone checks it, only payments from this wallet to Bitkit are
> expected to work.

## Why an EVM chain mode

Bitkit and this wallet used different chains for USD₮, so each app
ignored the other's USD₮ endpoint:

| | This wallet (default) | Bitkit iOS |
|---|---|---|
| Chain | Ethereum Sepolia testnet (`11155111`) | Arbitrum One (`42161`) |
| Token | Aave test USD₮ `0xaA8E…` (faucet) | USD₮0 `0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9` |
| Paykit endpoint | `usdt-sepolia-address` | `usdt-arbitrum-address` |

Bitkit has no testnet option for USD₮: its chain id and token are fixed
in `Bitkit/Models/PaykitUsdt.swift`. So this wallet moves to chain
`42161`. A local [Anvil](https://getfoundry.sh/) fork of Arbitrum One
keeps that chain id and the real USD₮0 contract, and its balances can be
set for free.

## What changes in each mode

The switch is `EXPO_PUBLIC_EVM_CHAIN`
([`src/config/evmChain.ts`](../src/config/evmChain.ts)). Leave it unset
for Sepolia. Any value other than `arbitrum-fork` stops the app at
launch.

| | Default (Sepolia) | `arbitrum-fork` |
|---|---|---|
| Chain id | `11155111` | `42161` |
| RPC | `https://ethereum-sepolia-rpc.publicnode.com` | `http://127.0.0.1:18545` (Anvil) |
| USD₮ token | Aave test USDT `0xaA8E…33D0` | USD₮0 `0xfd08…cbb9` |
| USD₮ endpoint id | `usdt-sepolia-address` | `usdt-arbitrum-address` (Bitkit's id) |
| Explorer links | Sepolia Etherscan | none |
| Activity history (indexer) | Blockscout Sepolia | none |
| When a USD₮ payment was made | counted from confirmations (one block per 12 s) | the block's timestamp, with 10 minutes' allowance |
| Test funds | Aave faucet ("Get test USD₮") and a public ETH faucet | `scripts/fund-fork.mjs` |
| npm script | `npm start` | `npm run start:arbitrum-fork` |

In the `arbitrum-fork` mode the wallet also:

- publishes its USD₮ address under Bitkit's endpoint id, with the payload
  Bitkit expects: `{"value":"0x…","chain_id":"42161","token":"0xfd08…cbb9"}`;
- sends USD₮ proofs with `chain_id` `"42161"` and signs them for that
  chain;
- accepts Bitkit's payment code, `ethereum:<USD₮0>@42161/transfer?address=…`;
- hides the Aave faucet, and refuses to sign any contract call (what
  lives at the faucet's address on Arbitrum is unknown);
- uses its own WDK asset ids (`eth-arbitrum-fork`, `usdt-arbitrum-fork`),
  so fork balances never mix with another chain's.

There is no mode for Arbitrum One itself, with real funds. See "Not in
this change" below.

Bitcoin is a separate switch. For the full Bitkit demo, Bitcoin runs on
Bitkit's staging regtest ([BITKIT-DEMO.md](BITKIT-DEMO.md)) and USD₮ on
the fork. `npm run start:bitkit-demo` sets both.

## What you need

- Everything in [BITKIT-DEMO.md](BITKIT-DEMO.md): a Bitkit iOS Debug
  build, the wallet's Debug build, and one iOS simulator with both.
- [Foundry](https://getfoundry.sh/)'s `anvil` (and `cast`). Install it
  yourself; this repository does not.
- A checkout of
  [bitkit-core](https://github.com/synonymdev/bitkit-core), for its
  `tests/usdt-fork` fixture.
- Node 24 (already needed for this repository).

The setup uses three local ports. Keep them free:

| Port | Service | Who talks to it |
|---|---|---|
| `18545` | Anvil, the fork | the wallet, the fixture, the shim, `fund-fork.mjs` |
| `18546` | bitkit-core's bundler and paymaster fixture | Bitkit (`USDT_BUNDLER_URL`) |
| `18547` | this repository's `receiptLogIndex` shim | Bitkit (`USDT_RPC_URL`) |

Start them in this order, each in its own terminal, and leave them
running for the whole demo.

## 1. Start the fork

```sh
anvil --fork-url https://arb1.arbitrum.io/rpc --host 127.0.0.1 --port 18545 --no-cors
```

`--no-cors` turns off Anvil's default permissive CORS. Without it, any web
page open on the Mac could call the fork's `anvil_*` methods and rewrite
balances or the clock.

Without `--fork-block-number`, Anvil forks the latest block. For runs
you can repeat, pin a block:
`--fork-block-number <block>`.

Anvil keeps the fork in memory. If you stop it, every balance and
payment on the fork is gone, and the apps' records then point at
transactions that no longer exist. Restart the fixture and the shim
after Anvil, and fund again.

The public Arbitrum RPC is rate limited. Anvil reads state it has not
seen yet from it, so the first calls can be slow or fail.

### Check the fork's clock

USD₮ proofs compare the block's time with when the request was made.
This wallet allows 10 minutes for clock differences (Bitkit allows 24
hours). The fork's blocks carry the fork's own clock, which can lag real
time, most of all when you pin an old `--fork-block-number`. A request
paid on a lagging fork is refused, and the refusal is final: "It was
paid before you asked for it." See "When a payment was made" below for
why the window is 10 minutes.

Check the latest block's time against your Mac's:

```sh
cast block latest --field timestamp --rpc-url http://127.0.0.1:18545
date +%s
```

`scripts/fund-fork.mjs` also warns when the two differ by more than 5
minutes. If the fork is behind, run it with `--sync-time` (see "Fund
both wallets"). A fork cannot go back in time: if it is ahead, restart
Anvil.

## 2. Start the bundler and paymaster

Bitkit does not send USD₮ as a plain transaction. It sends a
gas-sponsored smart-account operation (EIP-7702 and ERC-4337) through a
bundler, and pays the fee in USD₮0 through a paymaster. bitkit-core
ships a stand-in for both:

```sh
cd <bitkit-core>/tests/usdt-fork
npm ci && npm start
```

It prints "Fork provider ready on localhost:18546" when it is up. It
checks that `127.0.0.1:18545` is Anvil on chain `0xa4b1` before it
writes anything (`provider.mjs:22-23`).

What it does, and what it does not:

- At start it resets only its own test account, the address in
  bitkit-core's EIP-7702 test vectors (`provider.mjs:74-82`), makes its
  test signer a paymaster signer, and deposits 1 ETH for the paymaster.
- It was written for that one fixed account, and says it "does not model
  Pimlico's pricing, gas estimation, or service acceptance policy".
- **Unproven:** whether Bitkit can send USD₮ from its own address
  through it. This is the go/no-go for payments from Bitkit to this
  wallet. If it fails, a general local bundler (such as Pimlico's Alto)
  and a paymaster that sponsors on the fork are the next thing to try.
- Bitkit *receiving* USD₮ needs none of this: the wallet sends a plain
  ERC-20 transfer.

## 3. Start the `receiptLogIndex` shim

```sh
node scripts/arbitrum-fork-rpc.mjs
# same as: node scripts/arbitrum-fork-rpc.mjs --port 18547 --upstream http://127.0.0.1:18545
```

Bitkit names the payment's log in a proof by its position in the
receipt. It reads that position from a `receiptLogIndex` field on each
log of `eth_getTransactionReceipt` (bitkit-core
`src/modules/usdt/proof.rs:309-317`). Bitkit's own RPC gateway adds that
field (`src/modules/usdt/README.md:135`). Plain Anvil and the fixture do
not. Without the field Bitkit can neither create a USD₮ proof nor check
one, even though the payment itself went through.

The shim is a JSON-RPC proxy that adds `receiptLogIndex` (the log's
position, as a decimal string) to every log of every receipt, single or
batched. Everything else passes through unchanged. It listens on
`127.0.0.1` only, forwards only to `127.0.0.1` or `localhost`, and
refuses requests from a browser (any request with an `Origin` header).

The wallet does not need the shim: it talks to Anvil directly.

## 4. Launch Bitkit on the fork

Bitkit reads its USD₮ URLs from the launch environment in Debug builds
(`Bitkit/Constants/Env.swift@1b56274c1:13-27,65-76`). Launch it with:

```sh
xcrun simctl terminate <udid> to.bitkit
SIMCTL_CHILD_USDT_RPC_URL=http://127.0.0.1:18547 \
SIMCTL_CHILD_USDT_BUNDLER_URL=http://127.0.0.1:18546 \
SIMCTL_CHILD_USDT_DEPOSITS_URL=http://127.0.0.1:1 \
SIMCTL_CHILD_USDT_BRIDGES_URL=http://127.0.0.1:1 \
SIMCTL_CHILD_BLOCKTANK_REGTEST_AUTH='user:password' \
  xcrun simctl launch <udid> to.bitkit
```

- `USDT_RPC_URL` goes to the shim, not to Anvil, for the reason above.
- Deposits and bridges are not needed. An empty value does not turn
  them off: `configValue` ignores an empty environment value and falls
  back to the build's `Info.plist` (`Env.swift@1b56274c1:65-76`). So
  point them at `http://127.0.0.1:1`, where nothing listens, as Bitkit's
  own UI tests do (`BitkitUITests/UsdtWalletUITests.swift@1b56274c1:21-22`).
- `BLOCKTANK_REGTEST_AUTH` is the regtest secret from
  [BITKIT-DEMO.md](BITKIT-DEMO.md). Leave that line out if you do not
  fund or mine Bitcoin from Bitkit.
- The values apply to this launch only. Always start Bitkit with this
  command. Opened from its icon, it gets none of them and uses whatever
  USD₮ URLs its build carries, not the fork.

USD₮ needs a Debug build: Bitkit turns it on outside mainnet only in
Debug, and only when the RPC and bundler URLs are set
(`Env.swift@1b56274c1:9-10`). In Bitkit, tap **Enable USDT** when it
offers USD₮ (`Bitkit/Views/Sheets/UsdtIntroSheet.swift@1b56274c1`).

Bitkit's USD₮ address is its own key (EIP-7702 delegates it; there is no
separate smart-wallet address). Copy it from Bitkit's USD₮ receive
screen for the next step.

## 5. Build and run the wallet

Start Metro with both switches:

```sh
npm run start:bitkit-demo
# same as: EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest EXPO_PUBLIC_EVM_CHAIN=arbitrum-fork npx expo start --dev-client --clear
```

`npm run start:arbitrum-fork` moves only USD₮ to the fork and keeps
Bitcoin on Mutinynet.

The native Debug build is the same in every mode. Build it as in the
[README](../README.md) ("Run it"), then open the dev client on this
Metro server. What BITKIT-DEMO.md says about Metro's cache and Release
builds holds for `EXPO_PUBLIC_EVM_CHAIN` too. Do not export it in your
shell: `npm start` would then bundle the fork, and `npm test` would fail.

On the iOS simulator, `127.0.0.1` is your Mac, so the wallet reaches
Anvil as it is. On an Android emulator, forward the port as well as
Metro's:

```sh
adb reverse tcp:18545 tcp:18545
```

### Plain HTTP to the fork

The fork's RPC is plain HTTP (`http://127.0.0.1:18545`). The wallet
reads it in two ways, and the operating system treats them differently:

- WDK (balances, sends, receipts) reads it from its Bare worklet, over
  the worklet's own sockets.
- The wallet reads a block's time for a USD₮ proof with React Native's
  `fetch`, which goes through the platform's HTTP stack. iOS App
  Transport Security (ATS) and Android's cleartext rule apply to that
  read. If the platform blocks it, a USD₮ payment you received stays at
  "Checking when it was paid", while balances and sends keep working.

What this repository sets, checked in `app.json`, `plugins/` and
`node_modules`:

- Neither `app.json` nor a plugin in `plugins/` sets an ATS key
  (`NSAppTransportSecurity`) or Android's `usesCleartextTraffic`. The
  `expo-build-properties` options in `app.json` leave
  `android.usesCleartextTraffic` unset, and the plugin then changes
  nothing (`withAndroidCleartextTraffic` in
  `node_modules/expo-build-properties/src/android.ts`). So both come from
  the native template that `npx expo prebuild` writes.
- On Android 9 (API 28) and later, an app that does not allow cleartext
  traffic cannot use plain HTTP to any host, `127.0.0.1` included
  (`expo-build-properties` documents the default as `false`). This app's
  minimum is API 29.

What that means per build:

| Build | The block-time read over plain HTTP |
|---|---|
| iOS simulator, Debug or Release | Expected to work. Not checked: see below. |
| Android Debug | Expected to work. Not checked: see below. |
| Android Release | Blocked, unless you allow cleartext for the build. |

Not checked here, because the native template is not in this repository
(`ios/` and `android/` are generated and git-ignored) and nothing in this
guide has run:

- The ATS keys in the generated iOS `Info.plist`. Expo's template is
  understood to allow local networking (`NSAllowsLocalNetworking`). Check
  it after a prebuild:
  `plutil -extract NSAppTransportSecurity json -o - ios/<app name>/Info.plist`.
- That Android Debug allows cleartext. React Native's Android template
  is understood to allow it in Debug only, which is how Metro's plain
  HTTP works. Look for `android:usesCleartextTraffic` in
  `android/app/src/debug/AndroidManifest.xml` and
  `android/app/src/main/AndroidManifest.xml` after a prebuild.
- That the worklet's own sockets are outside ATS and the cleartext rule.

For an Android Release build on the fork, allow cleartext for that build
only: set `"usesCleartextTraffic": true` under `android` in the
`expo-build-properties` options in `app.json`, then prebuild and build
again. That allows plain HTTP to every host, not only the fork, so do not
commit it.

When the read fails, the Metro console (or the device log on a Release
build) shows a warning, once per kind of failure until a read works
again:

```text
USD₮ proof: could not read the block time from http://127.0.0.1:18545: <reason>
```

The reason is the platform's error. On Android, also check the
`adb reverse` above.

Check You > Network details: it shows "Arbitrum (local Anvil fork of
Arbitrum One) (chain id 42161)", RPC `http://127.0.0.1:18545`, history
"none" and the chain mode.

### Use a separate install and identity per EVM mode

Run each EVM mode in its own install, on its own simulator, as
[BITKIT-DEMO.md](BITKIT-DEMO.md) says for the Bitcoin modes. Requests,
the payment ledger and proofs stored under `usdt-sepolia-address` do not
carry over to `usdt-arbitrum-address`.

The wallet enforces this part. Each EVM mode keeps its seed under its
own wallet id (`paykit-wdk-demo` on Sepolia, `paykit-wdk-demo-arbitrum-fork`
on the fork), and the app records the EVM mode its wallet was created or
restored under (`src/wallet/evmModeGuard.ts`, stored in the plain
app-settings file). A build for another EVM mode does not open it, nor
create or restore a wallet there, and shows "This wallet is on another
network" with both modes named. With
no record, a device with a seed under the Sepolia id counts as Sepolia:
an install from before the record still opens on the default build
only, and the fork build refuses it. On iOS, deleting the app keeps the
seeds in the Keychain but loses the record, so a reinstalled fork build
opens its own wallet again, unless a Sepolia seed is also on the device.
To start an Arbitrum install fresh, erase the simulator.

Use a separate identity too. Each build publishes only its own USD₮
endpoint and removes the other (`syncPublicEndpoints` in
[`src/paykit/PaykitService.ts`](../src/paykit/PaykitService.ts)). If one
identity runs in two EVM modes, the install that synced last decides
which USD₮ endpoint payers see.

The dev prefill (`src/config/demo.ts`) is off on every EVM mode other
than Sepolia: its demo identities run on Sepolia, and restoring one on
the fork would move its USD₮ endpoint away from Sepolia payers. On the
fork, create a new wallet and sign up with a new staging signup code.

## 6. Fund both wallets

`scripts/fund-fork.mjs` sets ETH and USD₮0 balances on the fork:

```sh
node scripts/fund-fork.mjs <wallet 0x address> <Bitkit 0x address>   # 1,000 USD₮0 and 1 ETH each
node scripts/fund-fork.mjs 0xAbc… --usdt 250 --eth 0.5
node scripts/fund-fork.mjs 0xAbc… --sync-time                         # also move the fork's clock to now
```

The wallet's address is on You > Test funds, which in this mode tells
you to run this script. Bitkit pays its fees in USD₮0, so it only needs
USD₮0; the ETH does it no harm.

What the script does:

- It **sets** balances. Each address ends with exactly the amounts
  given, whatever it held before. Nothing is minted or sent.
- ETH: `anvil_setBalance`. USD₮0: it finds the token's balance storage
  slot (it tries slots 0 to 99, undoing every miss, as bitkit-core's
  fixture does) and writes the balance with `anvil_setStorageAt`.
- It never changes an address's code or nonce, so Bitkit's EIP-7702
  delegation survives.
- Before it writes anything, it refuses an `--rpc` that is not
  `http://127.0.0.1` or `http://localhost`, and a node that is not
  Anvil on chain `0xa4b1`.
- It takes `0x` addresses only. It reads no `.env.demo` and no secret.
- It prints each address's balances afterwards, and exits with an error
  if one does not match.
- It warns when the fork's latest block is more than 5 minutes from your
  Mac's clock. `--sync-time` mines one block at your Mac's time
  (`evm_setNextBlockTimestamp`, then `evm_mine`), only when the fork is
  behind.

Options: `--usdt <amount>` (default 1000), `--eth <amount>` (default 1),
`--rpc <url>` (default `http://127.0.0.1:18545`), `--sync-time`.

Then add each other as contacts and pay as in [DEMO.md](DEMO.md). Anvil
mines each transaction as it arrives, so a payment confirms within
seconds.

## What matches on both sides

Checked by reading both codebases and by this wallet's unit tests, not
by a run. Bitkit's side is bitkit-ios `1b56274c1` and bitkit-core
`6d4e01e`. The proof test vectors in
`src/wallet/__tests__/fixtures/erc20-payment-proofs.json` are a byte-for-byte
copy of bitkit-core's.

| What | This wallet | Bitkit |
|---|---|---|
| Endpoint id `usdt-arbitrum-address` | `src/config/evmChain.ts` (`endpointId`), `src/config/paykit.ts` (`ENDPOINT_USDT`) | `proof.rs:237` (`validate_binding`), `PaykitUsdt.swift@1b56274c1:25` |
| Endpoint payload: chain id `"42161"`, token compared lowercased, a 42-character address | `src/paykit/endpoints.ts:43,66-69` | `PaykitUsdt.swift@1b56274c1:8-19` |
| Payment code `ethereum:<token>@42161/transfer?address=…` | `src/wallet/addressFormat.ts:109-113` | `PaykitUsdt.swift@1b56274c1:28-29` |
| EIP-712 domain `Paykit ERC20 Payment`, version `1`, chain id | `src/wallet/erc20PaymentProof.ts:33,96-99` | `proof.rs:282` |
| Proof `chain_id` `"42161"` | `src/paykit/paymentProofs.ts:90` | `proof.rs:160`, `types.rs:4` |
| Proof JSON keys | `src/paykit/paymentProofs.ts:87-94` | `PaykitUsdtPaymentService.swift@1b56274c1:12-23` |
| The proof's log is named by its position in the receipt | `findErc20TransferLog` in `src/wallet/paymentEvidence.ts` | `proof.rs:125-136,309-317`, via the shim |

**Payments from a smart account.** Bitkit's transfer is sent by a
bundler, so the transaction's sender is not Bitkit. The receipt also
holds EntryPoint logs and a USD₮0 fee transfer to the paymaster. This
wallet never looks at the transaction's sender: it checks that the
proof's signer is the `from` of the USD₮0 Transfer the proof names
(`src/paykit/paymentProofs.ts:275-276`). A unit test feeds Bitkit's
`one_time` vector through the check with such a receipt
(`src/paykit/__tests__/paymentProofs.test.ts`, "Bitkit's proof vectors
through the payee's checks").

**When a payment was made.** Both sides read the block's timestamp. This
wallet allows 10 minutes (`EVM_BLOCK_TIMESTAMP_ALLOWANCE_MS` in
`src/paykit/paymentProofs.ts`, used when `paymentTime` in
`src/config/evmChain.ts` is `'block-timestamp'`) and stays at "Checking
when it was paid" until it has read the block's time. Bitkit allows 24
hours, because Arbitrum's sequencer may set a timestamp up to a day
behind (`PaykitUsdtPaymentService.swift@1b56274c1:72,77`). A payment
whose block lags more than 10 minutes passes Bitkit's check and fails
this wallet's, for good: a too-early payment is refused, not retried.

The shorter window is on purpose. Any transfer from the payer to the
same address inside the window, not yet claimed by another payment,
passes as payment for a new request. With 24 hours, a payer could pass
off a whole day's earlier transfers, such as a plain private send, as
payment for a new request. Real Arbitrum sequencer lag of more than 10
minutes is rare. On the fork, keep the clock current with `--sync-time`
(see "Check the fork's clock").

## Known gaps

- **No indexer on the fork.** Activity shows only the USD₮ and ETH sends
  this app made since it launched; the record is in memory. A received
  payment never gets a row: the balance moves, and that is all. A USD₮
  payment whose transaction hash was lost (the app stopped mid-send) is
  found only within the same launch. After a relaunch the wallet cannot
  find it, but it never decides "not sent" for USD₮: the payment stays
  reserved and shows as "May have been paid. Check Activity". It cannot
  be linked to its transaction automatically.
- **Bitkit's dollar requests are not payable.** Bitkit creates requests
  in `btc` or `usd` only (`CreatePaymentRequestView.swift@1b56274c1:311`,
  `PaykitAmount.swift@1b56274c1:3-6`), and pays a `usd` request in USD₮.
  This wallet reads only `btc` and `usdt` amounts
  (`src/paykit/requestTerms.ts:225`), so it shows a Bitkit dollar request
  with its raw amount and cannot pay it. This is out of scope here.
- **Recurring USD₮ requests to Bitkit, probably not payable.** From
  reading the code only: Bitkit picks no endpoint for a recurring request
  in `usdt` (`PaykitRequestPricing.swift@1b56274c1:97`).
- **A separate install and identity per EVM mode**, as above. The
  wallet refuses to open under another EVM mode than its own. The dev
  prefill is off on non-Sepolia EVM builds.
- **Anvil forgets everything when it stops.** Keep it running for the
  whole demo.

## Not in this change: Arbitrum One with real funds

Issue #2 lists real Arbitrum One as an optional fallback that needs the
owner's approval. It is left out: `EXPO_PUBLIC_EVM_CHAIN=arbitrum-one`
stops the app at launch, like any unknown value. A wallet on real funds
needs more than a new chain profile:

- **Key protection is demo-grade** (see the README), and the demo
  phrases are kept in plain, git-ignored files.
- **The phrase is shared with the Pubky identity.** The same mnemonic
  derives the Pubky key, and the two key uses are not domain-separated
  (`src/wallet/useWalletLifecycle.ts`).
- **No verified Arbitrum One indexer.** Activity and the search for a
  lost USD₮ payment would see only this launch's own sends, as on the
  fork, and received payments would never show.
- **Payment codes without a chain id mean Ethereum mainnet.** EIP-681
  defaults a missing chain id to chain 1. The wallet accepts such a code
  as its own chain, which is harmless on a test network but would send
  real USD₮0 on Arbitrum One for a code meant for another network.

A follow-up would need its own review and the owner's approval of exact
amounts, plus at least: key storage fit for real money, a key for the
EVM wallet that is separate from the Pubky identity's, a checked
Arbitrum One indexer for Activity and payment checks, refusing payment
codes without a chain id, real-funds wording on every screen that says
"test" today, no dev prefill, and fresh identities only.

## Not tested

Unit tests cover the wallet's endpoint, payload, payment code, proofs,
payment-time rule and guards on an `arbitrum-fork` build. None of the
following has run:

- Bitkit sending USD₮ on the fork through bitkit-core's fixture, from
  its own address (the go/no-go above).
- Any payment between the two apps on the fork, in either direction.
- The scripts against a live Anvil: `fund-fork.mjs` and
  `arbitrum-fork-rpc.mjs` are checked by reading and by lint only.
- WDK's worklet reaching `http://127.0.0.1:18545`, and the wallet reading
  a block's time over plain HTTP (see "Plain HTTP to the fork": the iOS
  ATS keys and Android Debug's cleartext setting are not checked, and
  Android Release blocks it).
- The Android emulator with `adb reverse`.
- Bitkit's history on the fork. For blocks from before the fork, Anvil
  may pass Bitkit's log queries on to the rate-limited public RPC.
