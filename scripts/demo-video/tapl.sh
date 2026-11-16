#!/bin/bash
# tapl.sh <udid> <label> [type] [index]: tap the element with exactly this label (for elements with no id)
source "${DEMO_VIDEO_DIR:?Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md)}/sims.env"
xy=$("$AXE" describe-ui --udid "$1" 2>/dev/null | python3 "$(dirname "$0")/find.py" "$2" "${3:-Button}" "${4:-0}") || { echo "tapl: no '$2'" >&2; exit 1; }
"$AXE" tap -x "${xy% *}" -y "${xy#* }" --udid "$1" >/dev/null
