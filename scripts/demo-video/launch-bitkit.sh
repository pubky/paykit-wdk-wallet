#!/bin/bash
# launch-bitkit.sh: (re)start Bitkit with USD₮ on the local fork (docs/BITKIT-USDT-FORK.md, step 4)
# and Bitcoin on Blocktank's staging regtest. Reads BLOCKTANK_REGTEST_AUTH from the repository's .env.demo.
source "${DEMO_VIDEO_DIR:?Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md)}/sims.env"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AUTH=$(grep -E '^BLOCKTANK_REGTEST_AUTH=' "$ROOT/.env.demo" | cut -d= -f2- | tr -d "'\"")
xcrun simctl terminate "$BITKIT_SIM" to.bitkit 2>/dev/null
SIMCTL_CHILD_USDT_RPC_URL=http://127.0.0.1:18547 \
SIMCTL_CHILD_USDT_BUNDLER_URL=http://127.0.0.1:18546 \
SIMCTL_CHILD_USDT_DEPOSITS_URL=http://127.0.0.1:1 \
SIMCTL_CHILD_USDT_BRIDGES_URL=http://127.0.0.1:1 \
SIMCTL_CHILD_BLOCKTANK_REGTEST_AUTH="$AUTH" \
  xcrun simctl launch "$BITKIT_SIM" to.bitkit >/dev/null && echo launched
