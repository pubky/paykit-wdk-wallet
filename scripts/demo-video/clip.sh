#!/bin/bash
# clip.sh start NN "Scene title|Caption line"   -> starts recording both simulators as clip NN
# clip.sh stop                                    -> stops the clip and runs the smoothness check
D="${DEMO_VIDEO_DIR:?Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md)}"; SCRIPTS="$(cd "$(dirname "$0")" && pwd)"
source "$D/sims.env"
C="$D/clips"; mkdir -p "$C"
now() { python3 -c 'import time;print(f"{time.time():.3f}")'; }
case "$1" in
  start)
    n="$2"; echo "$n" > "$C/current"
    rm -f "$C/$n-bitkit.mp4" "$C/$n-wallet.mp4" "$C/$n.meta"
    printf 'caption\t%s\n' "$3" > "$C/$n.meta"
    for s in bitkit wallet; do
      u=$BITKIT_SIM; [ $s = wallet ] && u=$WALLET_SIM
      : > "$C/$n-$s.log"
      nohup xcrun simctl io "$u" recordVideo --codec=h264 --force "$C/$n-$s.mp4" > "$C/$n-$s.log" 2>&1 &
      echo $! > "$C/$s.pid"
    done
    # Note when each recorder reports it has started; the two start times line the phones up later.
    left="bitkit wallet"
    for i in $(seq 1 200); do
      for s in $left; do
        if grep -q "Recording started" "$C/$n-$s.log" 2>/dev/null; then
          printf 'start_%s\t%s\n' "$s" "$(now)" >> "$C/$n.meta"; left=$(echo $left | sed "s/$s//")
        fi
      done
      [ -z "$(echo $left | tr -d ' ')" ] && break; sleep 0.05
    done
    echo "clip $n recording ($3)"
    ;;
  mark)
    n=$(cat "$C/current")
    printf 'mark\t%s\t%s\n' "$(now)" "$2" >> "$C/$n.meta"; echo "marked: $2"
    ;;
  stop)
    n=$(cat "$C/current")
    printf 'stop\t%s\n' "$(now)" >> "$C/$n.meta"
    kill -INT "$(cat "$C/bitkit.pid")" "$(cat "$C/wallet.pid")" 2>/dev/null
    for s in bitkit wallet; do for i in $(seq 1 100); do kill -0 "$(cat "$C/$s.pid")" 2>/dev/null || break; sleep 0.1; done; done
    python3 "$SCRIPTS/check.py" "$C/$n-bitkit.mp4" "$C/$n-wallet.mp4"
    ;;
esac
