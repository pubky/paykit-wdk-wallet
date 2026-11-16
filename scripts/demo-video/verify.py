#!/usr/bin/env python3
"""Verify the edit: (1) every still cut joins two frames that look the same, (2) the final video has
no black frames, (3) the final video has no stall in the middle of motion (phones area only)."""
import json, os, re, subprocess, sys
sys.argv = sys.argv[:1]
SCRIPTS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS)
import stage2

D = stage2.D
WORK = stage2.WORK
bad = 0

# 1. Still cuts
worst = []
for n in stage2.ORDER:
    info = json.load(open(os.path.join(WORK, f"{n}.json")))
    removed = stage2.validate(os.path.join(WORK, f"{n}_phones.mp4"), stage2.budget(info, stage2.kept_intervals(info)))
    src = os.path.join(WORK, f"{n}_phones.mp4")
    for a, b, k in removed:
        if k != "cut":
            continue
        t1, t2 = max(0, a - 1 / 30), b
        pngs = []
        for j, t in enumerate((t1, t2)):
            png = os.path.join(WORK, f".cut{j}.png")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1",
                            "-vf", "format=gray", png], check=True)
            pngs.append(png)
        out = subprocess.run(["ffmpeg", "-hide_banner", "-i", pngs[0], "-i", pngs[1], "-filter_complex",
                              "[0][1]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YMAX",
                              "-f", "null", "-"], capture_output=True, text=True).stderr
        y = int(re.findall(r"YMAX=(\d+)", out)[0])
        worst.append((y, n, round(a, 2), round(b, 2)))
worst.sort(reverse=True)
over = [w for w in worst if w[0] > 30]
print(f"1. still cuts checked: {len(worst)}; largest picture change across a cut: {worst[:3]}; over 30: {len(over)}")
bad += len(over)

final = os.path.join(D, "paykit-wdk-bitkit-demo-v3.mp4")
# 2. Black frames (ignore the first 0.5 s fade-in and the last 0.7 s fade-out)
log = subprocess.run(["ffmpeg", "-hide_banner", "-i", final, "-vf", "blackdetect=d=0.01:pix_th=0.10", "-f", "null", "-"],
                     capture_output=True, text=True).stderr
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", final],
                           capture_output=True, text=True).stdout)
blacks = [(float(a), float(b)) for a, b in re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", log)]
blacks = [x for x in blacks if x[0] > 0.6 and x[1] < dur - 0.8]
print(f"2. black frames inside the video: {blacks or 'none'}")
bad += len(blacks)

# 3. Stalls during motion, phones area only. Treat a frame that repeats the one before as "no new
# frame", rebuild the variable-rate timeline, then apply the same test as check.py.
out = subprocess.run(["ffmpeg", "-hide_banner", "-i", final, "-vf",
                      "crop=852:860:534:30,format=gray,tblend=all_mode=difference,signalstats,"
                      "metadata=print:key=lavfi.signalstats.YMAX:file=-,metadata=print:key=lavfi.signalstats.YAVG:file=-",
                      "-f", "null", "-"], capture_output=True, text=True).stdout
ymax = [int(x) for x in re.findall(r"YMAX=(\d+)", out)]
yavg = [float(x) for x in re.findall(r"YAVG=([\d.]+)", out)]
ts, ds = [0.0], [0.0]
for i, (mx, av) in enumerate(zip(ymax, yavg)):
    if mx > 8:  # a new picture arrived
        ts.append((i + 1) / 30); ds.append(av)
stalls = []
for i in range(2, len(ts) - 1):
    gap = ts[i] - ts[i - 1]
    if not (0.07 < gap <= 0.8):
        continue
    if not (ds[i - 1] > 0.05 and ts[i - 1] - ts[i - 2] < 0.05 and ds[i + 1] > 0.05 and ts[i + 1] - ts[i] < 0.05):
        continue
    nb = sorted(ds[max(1, i - 3):i])[len(ds[max(1, i - 3):i]) // 2]
    na = sorted(ds[i + 1:i + 4])[len(ds[i + 1:i + 4]) // 2]
    if ds[i] > 2.5 * max(nb, na):
        stalls.append((round(ts[i - 1], 2), int(gap * 1000)))
print(f"3. stalls during motion in the final video: {stalls or 'none'}")
bad += len(stalls)
print("PASS" if not bad else f"FAIL ({bad})")
