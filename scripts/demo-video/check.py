#!/usr/bin/env python3
"""Smoothness check for a raw simctl recording (variable frame rate).

simctl only writes a frame when the screen changes, so a long gap between frames
is normal when the screen is still. A hitch is a gap in the middle of motion:
the frames just before and just after the gap are both part of an animation
(changing, and arriving at display rate), yet no frame came for 70-800 ms.

Usage: check.py file.mp4 [more.mp4 ...]   -> prints one line per file, exit 1 if any hitch.
"""
import re, subprocess, sys

GAP_MIN, GAP_MAX = 0.07, 0.8   # seconds: what counts as a visible stall during motion
FAST = 0.05                    # neighbouring frames closer than this are "animating"
EPS = 0.05                     # mean luma difference that counts as a real change
JUMP = 2.5                     # resumed frame changes this many times more than its neighbours


def frames(path):
    cmd = ["ffmpeg", "-hide_banner", "-fflags", "+igndts", "-i", path, "-fps_mode", "passthrough",
           "-vf", "scale=120:-2,format=gray,tblend=all_mode=difference,signalstats,"
                  "metadata=print:key=lavfi.signalstats.YAVG:file=-",
           "-f", "null", "-"]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    ts, ds = [], []
    for line in out.splitlines():
        m = re.search(r"pts_time:([\d.]+)", line)
        if m:
            ts.append(float(m.group(1)))
        m = re.search(r"YAVG=([\d.]+)", line)
        if m:
            ds.append(float(m.group(1)))
    return ts, ds  # ds[i] = change from frame before t[i] to frame at t[i]


def hitches(ts, ds):
    t0 = 0.0  # simctl puts the first frame at 0 = recording start
    found = []
    for i in range(2, len(ts) - 1):
        gap = ts[i] - ts[i - 1]
        if not (GAP_MIN < gap <= GAP_MAX):
            continue
        before = ds[i - 1] > EPS and ts[i - 1] - ts[i - 2] < FAST
        after = ds[i + 1] > EPS and ts[i + 1] - ts[i] < FAST
        if not (before and after):
            continue
        # A real stall makes the picture jump when frames resume (the animation kept moving
        # meanwhile). One animation ending and another starting after a pause does not jump.
        typical = max(sorted(ds[max(1, i - 3):i])[len(ds[max(1, i - 3):i]) // 2],
                      sorted(ds[i + 1:i + 4])[len(ds[i + 1:i + 4]) // 2])
        if ds[i] > JUMP * typical:
            found.append((round(ts[i - 1] - t0, 2), int(gap * 1000)))
    return found


bad = False
for p in sys.argv[1:]:
    ts, ds = frames(p)
    h = hitches(ts, ds)
    dur = ts[-1] - ts[0] if ts else 0
    status = "SMOOTH" if not h else "HITCH"
    bad |= bool(h)
    print(f"{status:6s} {p.rsplit('/', 1)[-1]:28s} {len(ts):5d} frames {dur:6.1f}s  hitches(t,ms)={h}")
sys.exit(1 if bad else 0)
