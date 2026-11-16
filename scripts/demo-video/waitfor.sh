#!/bin/bash
# waitfor.sh <udid> <gone|exists> <text> [timeout]  -> polls the accessibility tree every 2 s
source "${DEMO_VIDEO_DIR:?Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md)}/sims.env"
u=$1; mode=$2; text=$3; to=${4:-90}; s=$(date +%s)
while :; do
  if "$AXE" describe-ui --udid "$u" 2>/dev/null | grep -q -- "$text"; then hit=1; else hit=0; fi
  [ "$mode" = exists ] && [ $hit = 1 ] && { echo "found '$text' after $(( $(date +%s)-s ))s"; exit 0; }
  [ "$mode" = gone ] && [ $hit = 0 ] && { echo "'$text' gone after $(( $(date +%s)-s ))s"; exit 0; }
  [ $(( $(date +%s)-s )) -ge "$to" ] && { echo "timeout waiting for '$text' ($mode)"; exit 1; }
  sleep 2
done
