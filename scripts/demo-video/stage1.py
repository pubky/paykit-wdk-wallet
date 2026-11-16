#!/usr/bin/env python3
"""Stage 1: for every clip, line the two phones up and put them side by side (no captions yet),
then report where the whole picture is frozen. Writes work2/<clip>_phones.mp4 and work2/<clip>.json."""
import json, os, re, subprocess, sys

D = os.environ.get("DEMO_VIDEO_DIR") or sys.exit("Set DEMO_VIDEO_DIR to the folder that holds clips/ (see docs/DEMO-VIDEO.md).")
C, WORK = os.path.join(D, "clips"), os.path.join(D, "work")
os.makedirs(WORK, exist_ok=True)
CLIPS = sys.argv[1:] or ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "11b"]
FF = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
ENC = ["-c:v", "libx264", "-preset", "fast", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "30"]
PHONE_H = 860


def meta(n):
    d, marks = {}, []
    for line in open(os.path.join(C, f"{n}.meta")):
        k, *v = line.rstrip("\n").split("\t")
        if k == "mark":
            marks.append((float(v[0]), v[1]))
        else:
            d[k] = v[0]
    return d, marks


for n in CLIPS:
    d, marks = meta(n)
    sb, sw, stop = float(d["start_bitkit"]), float(d["start_wallet"]), float(d["stop"])
    t0 = max(sb, sw)
    dur = stop - t0
    srcs = []
    for side, start in (("bitkit", sb), ("wallet", sw)):
        # simctl writes the first frame at 0 = when that recorder started, and then only on change.
        # Ignore its broken DTS, rebuild 30 fps, hold the last frame until stop, drop the head so
        # both phones start at the same wall-clock moment t0.
        off = t0 - start
        srcs += ["-fflags", "+igndts+genpts", "-i", os.path.join(C, f"{n}-{side}.mp4")]
    vf = []
    for i, start in enumerate((sb, sw)):
        off = t0 - start
        vf.append(f"[{i}:v]setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration={dur + 2:.3f},"
                  f"trim=start={off:.3f}:duration={dur:.3f},setpts=PTS-STARTPTS,scale=-2:{PHONE_H},setsar=1[p{i}]")
    graph = ";".join(vf) + (f";color=c=0x0f1418:s=1920x1080:r=30:d={dur:.3f}[bg];"
                            f"[bg][p0]overlay=534:30:eof_action=repeat[a];[a][p1]overlay=990:30:eof_action=repeat[v]")
    out = os.path.join(WORK, f"{n}_phones.mp4")
    if not os.path.exists(out):
        subprocess.run(FF + srcs + ["-filter_complex", graph, "-map", "[v]", "-t", f"{dur:.3f}"] + ENC + [out], check=True)
    # A frame counts as still when no pixel changed by more than STILL luma levels from the one
    # before (freezedetect averages over the whole 1080p frame, so it misses phone-sized motion).
    STILL, MIN_RUN = 20, 0.8
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", out, "-vf",
                          "format=gray,tblend=all_mode=difference,signalstats,"
                          "metadata=print:key=lavfi.signalstats.YMAX:file=-", "-f", "null", "-"],
                         capture_output=True, text=True).stdout
    ymax = [int(x) for x in re.findall(r"YMAX=(\d+)", log)]  # ymax[i]: change from frame i to i+1
    freezes, run_start = [], None
    for i, y in enumerate(ymax + [999]):
        t = (i + 1) / 30
        if y <= STILL and run_start is None:
            run_start = t
        elif y > STILL and run_start is not None:
            if t - run_start >= MIN_RUN:
                freezes.append((round(run_start, 3), round(min(t, dur), 3)))
            run_start = None
    info = {"clip": n, "duration": round(dur, 2), "caption": d["caption"],
            "marks": [(round(t - t0, 2), c) for t, c in marks], "freezes": freezes,
            "frozen_total": round(sum(b - a for a, b in freezes), 1)}
    json.dump(info, open(os.path.join(WORK, f"{n}.json"), "w"), indent=1)
    print(f"{n:4s} {dur:6.1f}s frozen {info['frozen_total']:5.1f}s  -> moving {dur - info['frozen_total']:5.1f}s  "
          f"long moving stretches: {[(a, b) for a, b in zip([0] + [e for _, e in freezes], [s for s, _ in freezes] + [dur]) if b - a > 8]}")
