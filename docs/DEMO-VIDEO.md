# Record the Bitkit × WDK demo video

This guide records and edits the side-by-side demo video of Bitkit iOS
and this wallet paying each other in Bitcoin and USD₮, with automatic
payments and a subscription. The tools are in
[`scripts/demo-video/`](../scripts/demo-video/). The last cut
(`paykit-wdk-bitkit-demo-v3.mp4`, 10 min 27 s) was made with them on
2026-11-16.

The setup itself is in two other guides; this one adds the recording:

- [BITKIT-DEMO.md](BITKIT-DEMO.md): Bitcoin on Blocktank's staging
  regtest.
- [BITKIT-USDT-FORK.md](BITKIT-USDT-FORK.md): USD₮ on a local fork of
  Arbitrum One, and the Bitkit demo patch for USD₮ allowances.

## What you need

| Tool | Used for | Install |
|---|---|---|
| Xcode with an iOS simulator runtime (checked: Xcode 26.6, iOS 26.5) | building and running both apps, `simctl io recordVideo` | App Store |
| Foundry 1.9.0 (`anvil`, `cast`) | the Arbitrum fork | `brew install foundry` (remove: `brew uninstall foundry`) |
| Node 24 and npm | this wallet, the fork scripts, bitkit-core's fixture | already needed by this repository |
| `ffmpeg` and `ffprobe` | editing and checks | `brew install ffmpeg` |
| Python 3 | editing scripts | macOS or Homebrew |
| `axe` | driving both apps from the shell | bundled with XcodeBuildMCP (`npx xcodebuildmcp`), or `brew install cameroncooke/axe/axe` |
| A bitkit-core checkout at its `0.8.0-rc15` tag | `tests/usdt-fork` (run `npm ci` there) | `git clone https://github.com/synonymdev/bitkit-core` |
| A bitkit-ios checkout at `d1a07fea0` with [`bitkit-demo.patch`](bitkit-demo.patch) applied on a local branch | Bitkit Debug build | see BITKIT-USDT-FORK.md |
| `.env.demo` with `BLOCKTANK_REGTEST_AUTH` | regtest funding and mining | see BITKIT-DEMO.md |
| A Pubky staging invite code | the wallet's identity | one per new identity |

`ffmpeg` needs no `drawtext` filter: text is drawn by `render.swift`.

## 1. Prepare a work folder

Everything the tools write goes into one folder outside the repository:

```sh
export DEMO_VIDEO_DIR=~/paykit-demo-video
mkdir -p "$DEMO_VIDEO_DIR"
```

Create two simulators (iPhone 17), one per app, and write their ids and
the path to `axe` into `$DEMO_VIDEO_DIR/sims.env`:

```sh
BITKIT_SIM=<Bitkit simulator udid>
WALLET_SIM=<wallet simulator udid>
AXE=<path to axe>
```

## 2. Start the services and build the apps

1. Start Anvil, bitkit-core's fixture and the shim as in
   BITKIT-USDT-FORK.md steps 1 to 3. Use `--block-time 2` and a fork URL
   that serves old state.
2. Build Bitkit (Debug, with the demo patch) and install it on
   `BITKIT_SIM`. Start it with `scripts/demo-video/launch-bitkit.sh`,
   never from its icon.
3. Build this wallet as a **Release** build, so there is no Metro or dev
   overlay on screen: in a throwaway worktree, write `.env.local` with
   `EXPO_PUBLIC_BTC_CHAIN=bitkit-regtest` and
   `EXPO_PUBLIC_EVM_CHAIN=arbitrum-fork`, run
   `npx expo prebuild --platform ios --clean`, then build the
   `PaykitWDK` scheme in the Release configuration for `WALLET_SIM`.
4. Grant both apps the camera (`xcrun simctl privacy <udid> grant
   camera <bundle id>`), so iOS doesn't ask during a take.

## 3. Set up both identities off camera

Start from erased simulators, so no keychain item from an earlier run
comes back.

- **Bitkit (Ben):** new wallet, **Enable USDT**, create the profile
  "Ben", finish **Pay Contacts**, turn on **Settings › General ›
  Public payments**, and enable notifications once. Dismiss the backup
  prompt.
- **Wallet (Ana):** create a wallet, sign up with a staging invite code,
  publish the name "Ana".
- **Funds:** `node scripts/fund-btc.mjs --chain bitkit-regtest <address>
  <sats>` for each Bitcoin address, and `node scripts/fund-fork.mjs
  <address> --usdt <amount>` for each USD₮ address (Ana also needs ETH
  for gas; Bitkit pays its fees in USD₮).
- **Status bars:** `xcrun simctl status_bar <udid> override --time 9:41
  --batteryState charged --batteryLevel 100 --wifiBars 3
  --cellularMode notSupported` on both.

## 4. Record the scenes

Record one short clip per scene. `clip.sh` records both simulators at
once and checks the clip for stalls when it stops:

```sh
scripts/demo-video/clip.sh start 05 "5 · USD₮ between contacts|Ben pays Ana 5 USD₮ from Bitkit"
# … drive both apps with axe …
scripts/demo-video/clip.sh mark "5 · USD₮ between contacts|Ana's WDK wallet sees the transfer"
scripts/demo-video/clip.sh stop
```

The text before `|` is the scene title; the rest is the caption. Keep
captions about what the person sees and does ("Ana sends Ben 5 USD₮").
Leave out the test setup (regtest, the fork, the Bitkit patch, Paykit
versions) and the plumbing (proof formats, smart accounts, gas).
Call a feature by the name both screens can show: Bitkit labels
Allowances as "Allowances", so the captions say "allowance" even
though the wallet's button reads "Set up automatic payments".
`mark` changes the caption from that moment. Drive the apps with `axe
tap --id <id>`; `tapl.sh` taps an element by its label when it has no
id, `ui.sh` lists what is on screen, and `waitfor.sh` waits for text to
appear. Keep recording through waits (blocks, proofs): the edit removes
still frames.

`clip.sh stop` prints `SMOOTH` or `HITCH` for each phone. A hitch is a
gap of 70 to 800 ms in the middle of motion. Look at the frames around
it (`peek.sh <clip> <seconds>`): text typed in one burst can show as a
hitch without being visible. Re-take a clip with a real stall.

The v3 scenes, in order:

| Clip | Scene | What happens |
|---|---|---|
| 01 | Two wallets, two stacks | both home screens |
| 02 | Pay a stranger by pubky | Ana pays Ben 20,000 sats by pubky; a block is mined; Ana pays Ben 3 USD₮ by pubky |
| 03 | Become contacts | Ana adds Ben, Ben adds Ana, the link completes |
| 04 | Private addresses | Ben's private addresses reach Ana |
| 05 | USD₮ between contacts | Ben pays Ana 5 USD₮ |
| 06 | Request money | Ana asks Ben for 10 USD₮; Ben pays; Ana's wallet checks the proof and sends a receipt |
| 07 | (same) | Ben asks Ana for 15,000 sats; Ana pays; a block is mined |
| 08 | Allowances | Ana gives Ben a USD₮ allowance; Bitkit accepts |
| 09 | (same) | Ben asks for $2; Ana's wallet pays it without a tap, within the allowance |
| 10 | A subscription | Ben starts a $1-a-minute subscription; Ana's wallet pays each minute under the same allowance |
| 11, 11b | Stop | Ana ends the allowance; Bitkit shows it ended |

Things that interrupt a take, and how to avoid them:

- **Bitkit's "Received …" sheets** stay up until tapped, and queue up
  during a subscription. Dismiss them (`ReceivedTransactionButton`)
  before the next clip.
- **iOS "Allow Paste"** appears when the wallet pastes from the
  simulator's clipboard. Type pubkeys instead, in 8-character chunks.
- **Typing into React Native fields** can drop characters when typed
  fast: type amounts one character at a time.

## 5. Edit

```sh
python3 scripts/demo-video/stage1.py     # lines up both phones per clip, finds still frames
python3 scripts/demo-video/stage2.py     # cuts, captions, cards; writes the final video
python3 scripts/demo-video/verify.py     # checks every cut, black frames and stalls
```

`stage2.py` holds this cut's settings at the top: the clip order, and
`SKIPS`, the waits with something moving on screen (a spinner, Bitkit's
coin animation) that are shortened with a 0.5 s crossfade. Pick skips
from a contact sheet of the clip, for example one frame every 4 s:

```sh
ffmpeg -i "$DEMO_VIDEO_DIR/work/07_phones.mp4" \
  -vf "trim=start=130:end=334,setpts=PTS-STARTPTS,fps=1/4,crop=852:860:534:30,scale=213:215,tile=8x4" \
  -frames:v 1 sheet.png
```

Never cut across a caption change. The edit follows these rules:

- Nothing is sped up.
- A still cut joins two frames that look the same.
- Clips join with 0.4 s crossfades.
- Captions crossfade on their own layer.

### Keep it short

Aim for about 5½ minutes. Recording live leaves about half the footage as
waiting, and the still cuts alone don't remove it:

- Bitkit's "Sent" and "Received" sheets animate confetti and coins, so a
  still-frame search counts them as motion. Add a `SKIPS` entry for each
  one: keep the moment the sheet appears and the moment the other phone
  updates.
- Cut each pause between taps to about 1 s.
- Keep every caption on screen for at least 5½ s, longer for long ones.
- Look at the frames on both sides of every cut. A small change can be
  the point of a scene; for example, Ana's contact flipping to "Private
  connection ready".

`verify.py` must print `PASS`. The title and end cards are in
`stage2.py`; the side labels are in `render.swift`. Both stay free of
setup details too.
