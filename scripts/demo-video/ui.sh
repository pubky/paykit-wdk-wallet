#!/bin/bash
# ui.sh <udid>: the labelled or identified elements on screen, one per line
source "${DEMO_VIDEO_DIR:?Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md)}/sims.env"
"$AXE" describe-ui --udid "$1" 2>/dev/null | python3 "$(dirname "$0")/ui.py"
