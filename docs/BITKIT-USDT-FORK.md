# Pay USD₮ with Bitkit on a local Arbitrum fork

This guide runs the wallet's USD₮ on a private copy of Arbitrum One on
your Mac, next to a Bitkit iOS Debug build pointed at the same copy. Use
it to demo Paykit USD₮ payments between this wallet and Bitkit without
spending real money.

> **Run end to end on 2026-11-16** with this wallet's Release build on
> one iOS 26.5 simulator and Bitkit iOS `d1a07fea0` (Paykit 0.1.1-rc8,
> bitkit-core 0.8.0-rc15) on another. Stock Bitkit and this wallet
> paid each other USD₮ in both directions, by pubky and as contacts,
> and settled USD₮ payment requests both ways with proofs. Allowances
> and minute subscriptions with Bitkit need a small local Bitkit patch:
> see [Automatic payments and subscriptions with
> Bitkit](#automatic-payments-and-subscriptions-with-bitkit).

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
| Activity history | Blockscout Sepolia | USD₮ Transfer logs read from the fork's RPC (no ETH) |
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
  yourself; this repository does not. On macOS, `brew install foundry`
  (checked with 1.9.0; `brew uninstall foundry` removes it).
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
anvil --fork-url https://arbitrum-one.public.blastapi.io --block-time 2 \
  --host 127.0.0.1 --port 18545 --no-cors
```

- `--fork-url` must serve **old state**. Anvil reads every account and
  storage slot it hasn't seen yet from this RPC, at the block it forked.
  Arbitrum's own `https://arb1.arbitrum.io/rpc` keeps only recent state,
  and Arbitrum makes about four blocks a second, so within minutes every
  new account fails with `historical state … is not available` (Bitkit
  then shows its USD₮ balance as `—`). Blast API's free public endpoint
  serves old state and worked for a whole demo. The free endpoints
  checked on 2026-11-16 that did not: `arb1.arbitrum.io`,
  `arbitrum.drpc.org`, `1rpc.io/arb`, `arbitrum.meowrpc.com`; PublicNode
  and Ankr want an API key for old state.
- `--block-time 2` mines a block every 2 seconds. Without it, an idle
  fork mines nothing, so its latest block falls behind the clock.
  bitkit-core's paymaster signs each fee approval as valid until the
  *latest* block's time plus 10 minutes, so after 10 idle minutes every
  Bitkit USD₮ send fails with `AA32 paymaster expired or not due`. On a
  fork that is already running, `cast rpc evm_setIntervalMining 2
  --rpc-url http://127.0.0.1:18545` does the same.
- `--no-cors` turns off Anvil's default permissive CORS. Without it, any
  web page open on the Mac could call the fork's `anvil_*` methods and
  rewrite balances or the clock.

Without `--fork-block-number`, Anvil forks the latest block. For runs
you can repeat, pin a block:
`--fork-block-number <block>`.

Anvil keeps the fork in memory. If you stop it, every balance and
payment on the fork is gone, and the apps' records then point at
transactions that no longer exist. Restart the fixture and the shim
after Anvil, and fund again.

The public RPC is rate limited. Anvil reads state it has not seen yet
from it, so the first calls can be slow.

### Check the fork's clock

USD₮ proofs compare the block's time with when the request was made.
This wallet allows 10 minutes for clock differences (Bitkit allows 24
hours). The fork's blocks carry the fork's own clock, which can lag real
time, most of all when you pin an old `--fork-block-number`. A request
paid on a lagging fork is refused, and the refusal is final: "It was
paid before you asked for it." See "When a payment was made" below for
why the window is 10 minutes.

Check the time the fork's next block would get against your Mac's:

```sh
cast block pending --field timestamp --rpc-url http://127.0.0.1:18545
date +%s
```

Use `pending`, not `latest`: without `--block-time`, Anvil mines only
when a transaction arrives, so an idle fork's latest block falls behind
your Mac's clock even though the next block will be stamped correctly.
With `--block-time 2` both stay within a few seconds of the clock.

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
- Its setup was written for that one fixed account, and it says it
  "does not model Pimlico's pricing, gas estimation, or service
  acceptance policy". Its relay part takes any sender: Bitkit sends USD₮
  from its own address through it, with the fee paid in USD₮0 (checked;
  fund Bitkit's address with `fund-fork.mjs` first).
- It needs the fork's blocks to keep time (`--block-time 2` above), or
  sends fail with `AA32 paymaster expired or not due`.
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
batched.

It also moves the start of every `eth_getLogs` range up to the block the
fork started from. Bitkit reads its USD₮ history from block 0, and Anvil
sends the part of a log query before the fork to the forked RPC, which
refuses ranges over 100,000 blocks; Bitkit then shows its USD₮ balance
as `—`. Demo accounts are new, so they have no history before the fork.
History of an account that existed before the fork is not shown.

Everything else passes through unchanged. It listens on
`127.0.0.1` only, forwards only to `127.0.0.1`, and refuses requests
from a browser (any request with an `Origin` header). It will not start
with an `--upstream` on its own `--port`, which would forward to itself.

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
screen (**Show Details**) for the next step.

For the demo, also set in Bitkit:

- **Settings › General › Public payments** on, so this wallet can pay
  Ben by pubky. It is off by default; the wallet then says "Ben doesn't
  publish payment addresses for everyone."
- Allow notifications once (**Settings › General › Notifications ›
  Enable**). Otherwise iOS asks in the middle of a payment.

Stock Bitkit offers USD₮ only when paying a **contact** (its Send screen
lists USD₮ as a source only for a contact's private payment list). Paid
by pubky, a stranger gets Bitcoin from Bitkit.

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
| iOS simulator, Release | Works (checked on 2026-11-16: proofs were checked and Activity read the fork). |
| iOS simulator, Debug | Expected to work. Not checked. |
| Android Debug | Expected to work. Not checked: see below. |
| Android Release | Blocked, unless you allow cleartext for the build. |

Not checked here, because the native template is not in this repository
(`ios/` and `android/` are generated and git-ignored):

- The ATS keys in the generated iOS `Info.plist`. Expo's template is
  understood to allow local networking (`NSAllowsLocalNetworking`). Check
  it after a prebuild:
  `plutil -extract NSAppTransportSecurity json -o - ios/<app name>/Info.plist`.
- That Android Debug allows cleartext. React Native's Android template
  is understood to allow it in Debug only, which is how Metro's plain
  HTTP works. Look for `android:usesCleartextTraffic` in
  `android/app/src/debug/AndroidManifest.xml` and
  `android/app/src/main/AndroidManifest.xml` after a prebuild.
- That the worklet's own sockets are outside ATS and the cleartext rule
  on Android (on the iOS simulator they reach the fork).

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
"USD₮ transfer logs from the fork's RPC" and the chain mode.

### Use a separate install and identity per EVM mode

Run each EVM mode in its own install, on its own simulator, as
[BITKIT-DEMO.md](BITKIT-DEMO.md) says for the Bitcoin modes. Requests,
the payment ledger and proofs stored under `usdt-sepolia-address` do not
carry over to `usdt-arbitrum-address`.

Nothing in the app enforces this, as for `EXPO_PUBLIC_BTC_CHAIN`.
Switching `EXPO_PUBLIC_EVM_CHAIN` on an existing install (or restoring a
Paykit backup made under the other mode) mixes the two modes' contacts,
requests and proofs; USD₮ proofs from the other mode are then rejected
as "The proof names another network". Use a fresh install, or erase the
simulator, per mode. On iOS, Keychain items survive an uninstall, so
erase the simulator to start clean.

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
  slot (it tries slots 0 to 99 and undoes every probe, the match
  included, as bitkit-core's fixture undoes its misses) and writes the
  balance with `anvil_setStorageAt`.
- It never changes an address's code or nonce, so Bitkit's EIP-7702
  delegation survives.
- Before it writes anything, it refuses an `--rpc` that is not
  `http://127.0.0.1`, and a node that is not Anvil on chain `0xa4b1`.
- It takes `0x` addresses only. It reads no `.env.demo` and no secret.
- It prints each address's balances afterwards, and exits with an error
  if one does not match. If an RPC call fails, it stops with one line
  that names the step: while checking the clock or finding the slot,
  before any balance is set; while setting balances, with the address it
  was on and the addresses already set.
- It warns when the time the fork's next block would get is more than 5
  minutes from your Mac's clock. It reads that from the `pending` block,
  and uses the latest block only when Anvil gives no pending time; the
  warning says which one it measured. `--sync-time` mines one block at
  your Mac's time (`evm_setNextBlockTimestamp`, then `evm_mine`), only
  when the fork is behind.

Options: `--usdt <amount>` (default 1000), `--eth <amount>` (default 1),
`--rpc <url>` (default `http://127.0.0.1:18545`), `--sync-time`.

Then add each other as contacts and pay as in [DEMO.md](DEMO.md). With
`--block-time 2`, a payment confirms within a few seconds.

Balances set this way have no Transfer log, so they don't show in either
app's activity list; only the balance changes.

## What matches on both sides

Checked by reading both codebases, by this wallet's unit tests, and by
the live run above. Line references are to bitkit-ios `1b56274c1` and
bitkit-core `6d4e01e`; the run used bitkit-ios `d1a07fea0`. The proof
test vectors in
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

## Automatic payments and subscriptions with Bitkit

What stock Bitkit does, read from bitkit-ios `d1a07fea0`:

- **Bitkit pays automatically only over Lightning**, and only one-time
  requests (`PaykitAllowanceExecutor.swift`: "An on-chain allowance
  payment stays manual"). This wallet has no Lightning, so Bitkit never
  pays its requests without a tap.
- **Bitkit accepts allowance offers in bitcoin only**
  (`PaykitAllowance.swift`, `init?(record:)`). An offer where Bitkit is
  the Allowee (the payee) is accepted without asking.
- **Bitkit's subscriptions repeat daily at the most often.** A minute or
  hour schedule shows as "Unsupported frequency"
  (`PaykitSubscription.swift`, `Unit.isSupported`).
- **Bitkit's dollar requests are priced in `usd`** with a fixed rate of
  `1` to `usdt`. The Paykit spec says an Allowance cannot pay a request
  that a rate reprices (`specs/payment-conversion.md`: "Allowances account
  in the requested asset and amount and cannot authorize repricing").

So with stock Bitkit this wallet can offer **bitcoin** automatic
payments to Bitkit and pay Bitkit's one-time bitcoin requests within
them. For the demo video, a local Bitkit patch,
[`bitkit-demo.patch`](bitkit-demo.patch), changes only what a demo
needs, about 50 lines:

- minute and hour schedules count as supported, with English labels, and
  **Every minute** is a choice when creating a subscription;
- a dollar request or subscription is sent in `usdt` over the USD₮ rail
  only, with no rate, so this wallet's USD₮ Allowance can pay it;
- a USD₮ allowance offer is accepted when Bitkit is the Allowee, and its
  limits show in dollars.

It is not for merging into Bitkit. Apply it to a local branch:

```sh
git -C <bitkit-ios> switch -c demo/usdt-allowances-local d1a07fea0
git -C <bitkit-ios> apply <this repository>/docs/bitkit-demo.patch
```

With the patch, checked live: this wallet offered USD₮ automatic
payments, Bitkit accepted, a $2 request from Bitkit was accepted and
paid without a tap, and a $1 every-minute subscription was paid each
minute until the offer's limit of 10 payments an hour. Bitkit checked
each payment's proof against the fork.

## Known gaps

- **USD₮ only in the fork's Activity.** Activity reads the fork's USD₮0
  Transfer logs from the block the fork started at. ETH movements are
  not listed, and a balance set with `fund-fork.mjs` has no log. A USD₮
  payment whose transaction hash was lost (the app stopped mid-send) is
  matched against those logs.
- **Bitkit's dollar requests are not payable.** Bitkit creates requests
  in `btc` or `usd` only (`CreatePaymentRequestView.swift@1b56274c1:311`,
  `PaykitAmount.swift@1b56274c1:3-6`), and pays a `usd` request in USD₮.
  This wallet reads only `btc` and `usdt` amounts
  (`src/paykit/requestTerms.ts:225`), so it shows a Bitkit dollar request
  with its raw amount and cannot pay it. The demo patch above sends them
  in `usdt` instead.
- **Recurring USD₮ requests to Bitkit.** Bitkit picks no endpoint for a
  recurring request in `usdt` (`PaykitRequestPricing.swift@1b56274c1:97`);
  the demo patch changes that.
- **Bitkit shows a popup for every USD₮ it receives.** During a minute
  subscription, "Received USDT $1.00" sheets queue up and cover the
  screen until each is dismissed.
- **A separate install and identity per EVM mode**, as above. Nothing
  in the app enforces it. The dev prefill is off on non-Sepolia EVM
  builds.
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

## What was tested

Run live on 2026-11-16, both apps on iOS 26.5 simulators, this wallet as
a Release build with `bitkit-regtest` and `arbitrum-fork`:

- `fund-fork.mjs`, `arbitrum-fork-rpc.mjs` and bitkit-core's fixture
  against a live Anvil fork.
- Bitkit sending USD₮ from its own address through the fixture, to a
  contact, and paying this wallet's USD₮ request. This wallet checked
  Bitkit's proof (a transfer from a smart account) and sent a receipt.
- This wallet paying Bitkit USD₮ by pubky, and paying Bitkit's USD₮
  requests; Bitkit checked the proofs ("Payment verified").
- With the demo patch: automatic payments and a minute subscription, as
  in the section above.
- Bitcoin on Blocktank's staging regtest alongside, as in
  [BITKIT-DEMO.md](BITKIT-DEMO.md).

Not tested:

- A Debug build of this wallet on the fork, and any Android build
  (including `adb reverse` and cleartext HTTP).
- Bitkit as the payer under an Allowance (it pays automatically only
  over Lightning, which this wallet lacks).
- Real Arbitrum One.
