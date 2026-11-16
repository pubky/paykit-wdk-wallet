#!/bin/bash
# peek.sh NN [t]  -> side-by-side PNG of clip NN at time t (default: last frame), both phones
D="${DEMO_VIDEO_DIR:?Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md)}/clips"
n=$1; out=$D/peek-$n.png
for s in bitkit wallet; do
  if [ -n "$2" ]; then ffmpeg -v error -y -fflags +igndts -ss "$2" -i $D/$n-$s.mp4 -frames:v 1 -vf scale=-2:700 $D/.p-$s.png
  else ffmpeg -v error -y -fflags +igndts -i $D/$n-$s.mp4 -vf scale=-2:700 -update 1 $D/.p-$s.png; fi
done
ffmpeg -v error -y -i $D/.p-bitkit.png -i $D/.p-wallet.png -filter_complex hstack $out && echo $out
