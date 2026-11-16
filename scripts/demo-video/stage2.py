#!/usr/bin/env python3
"""Stage 2: edit each side-by-side clip and join them into the final video.

Inside a clip only two kinds of edits happen:
  * still cuts: part of a stretch where neither phone changes is removed. The frames on both sides
    of the cut are the same picture, so the cut cannot be seen.
  * skips: a long wait that has a spinner on screen is shortened with a 0.5 s crossfade.
Nothing is sped up. Clips are joined with 0.4 s crossfades; captions crossfade at their markers.
"""
import json, os, re, subprocess, sys

SCRIPTS = os.path.dirname(os.path.abspath(__file__))
D = os.environ.get("DEMO_VIDEO_DIR") or sys.exit("Set DEMO_VIDEO_DIR (see docs/DEMO-VIDEO.md).")
WORK = os.path.join(D, "work")
FF = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30"]
ORDER = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "11b"]
# Waits with a spinner or looping animation on screen: (from, to) in clip seconds, crossfaded.
SKIPS = {"02": [(52.0, 110.0)], "03": [(56.0, 98.0)], "06": [(74.0, 90.0)], "07": [(147.0, 322.0)], "10": [(115.0, 225.0)], "11": [(60.0, 210.0)]}
# Clips that continue the caption of the clip before only need a short beat.
CONTINUES = {"11b": 5.0}
KEEP = 0.7        # seconds of every still stretch that stay in
LEAD, TAIL = 0.6, 1.8   # untouched stillness at the start and end of a clip
XF_CLIP, XF_SKIP, XF_CAP = 0.4, 0.5, 0.35


def read_time(chars):
    return max(4.5, chars / 15.0 + 1.0)


def kept_intervals(info):
    """Source intervals to keep, and how each joins the next ('cut' or 'skip')."""
    dur, marks = info["duration"], [t for t, _ in info["marks"]]
    remove = []  # (a, b, kind)
    for a, b in SKIPS.get(info["clip"], []):
        remove.append((a, b, "skip"))
    for a, b in info["freezes"]:
        a2, b2 = max(a + KEEP, LEAD), min(b, dur - TAIL)
        # never cut across a caption change
        pieces = [(a2, b2)]
        for m in marks:
            nxt = []
            for x, y in pieces:
                if y <= m - 0.6 or x >= m + 0.6:
                    nxt.append((x, y))
                else:
                    if m - 0.6 > x: nxt.append((x, m - 0.6))
                    if y > m + 0.6: nxt.append((m + 0.6, y))
            pieces = nxt
        for x, y in pieces:
            if y - x > 0.2 and not any(sa <= x and y <= sb for sa, sb, _ in remove if _ == "skip"):
                remove.append((x, y, "cut"))
    remove.sort()
    # merge overlaps (a skip wins)
    merged = []
    for a, b, k in remove:
        if merged and a < merged[-1][1]:
            pa, pb, pk = merged[-1]
            merged[-1] = (pa, max(pb, b), "skip" if "skip" in (pk, k) else "cut")
        else:
            merged.append((a, b, k))
    return merged


def budget(info, removed):
    """Give captions their reading time back by shrinking still cuts (largest first)."""
    dur = info["duration"]
    bounds = [0.0] + [t for t, _ in info["marks"]] + [dur]
    caps = [info["caption"]] + [c for _, c in info["marks"]]
    removed = list(removed)
    for i in range(len(caps)):
        lo, hi = bounds[i], bounds[i + 1]
        need = CONTINUES.get(info["clip"], read_time(len(caps[i].split("|", 1)[1])))
        def shown():
            s = hi - lo
            for a, b, k in removed:
                ov = max(0.0, min(b, hi) - max(a, lo))
                s -= ov + (XF_SKIP if k == "skip" and ov > 0 else 0)
            return s
        while shown() < need - 0.05:
            cuts = [(b - a, j) for j, (a, b, k) in enumerate(removed) if k == "cut" and a < hi and b > lo]
            if not cuts:
                break
            _, j = max(cuts)
            a, b, k = removed[j]
            give = min(b - a, need - shown())
            removed[j] = (a, b - give, k) if b - give - a > 0.05 else None
            removed = [r for r in removed if r]
    return removed


_frames = {}


def frame_diff(src, t1, t2):
    """Largest per-pixel luma difference between the frames shown at t1 and t2."""
    pngs = []
    for t in (t1, t2):
        key = (src, round(t, 3))
        if key not in _frames:
            png = os.path.join(WORK, f".f{len(_frames)}.png")
            subprocess.run(FF + ["-ss", f"{t:.3f}", "-i", src, "-frames:v", "1", "-vf", "format=gray", png], check=True)
            _frames[key] = png
        pngs.append(_frames[key])
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", pngs[0], "-i", pngs[1], "-filter_complex",
                          "[0][1]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YMAX",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    return int(re.findall(r"YMAX=(\d+)", out)[0])


SAME = 30  # a cut is invisible only if the frames either side differ by no more than this


def validate(src, removed):
    """Shrink every still cut to the part where the picture really matches the last kept frame.
    Slow animations (Bitkit's turning coins) change too little per frame to register as motion,
    but add up over seconds; cutting through them would make the picture jump."""
    out = []
    for a, b, k in removed:
        if k != "cut":
            out.append((a, b, k)); continue
        anchor = max(0.0, a - 1 / 30)
        if frame_diff(src, anchor, b) <= SAME:
            out.append((a, b, k)); continue
        lo, hi = a, b  # find the latest end that still matches the anchor
        for _ in range(7):
            mid = round((lo + hi) / 2 * 30) / 30
            if frame_diff(src, anchor, mid) <= SAME:
                lo = mid
            else:
                hi = mid
        if lo - a > 0.3:
            out.append((a, lo, k))
    return out


def edit_clip(n):
    info = json.load(open(os.path.join(WORK, f"{n}.json")))
    dur = info["duration"]
    removed = validate(os.path.join(WORK, f"{n}_phones.mp4"), budget(info, kept_intervals(info)))
    keeps, joins, pos = [], [], 0.0
    for a, b, k in removed:
        keeps.append((pos, a)); joins.append(k); pos = b
    keeps.append((pos, dur))
    # Output time of each kept interval
    out_start, t = [], 0.0
    for i, (a, b) in enumerate(keeps):
        out_start.append(t)
        t += b - a
        if i < len(joins) and joins[i] == "skip":
            t -= XF_SKIP
    total = t

    def to_out(src):
        for (a, b), o in zip(keeps, out_start):
            if a - 1e-6 <= src <= b + 1e-6:
                return o + (src - a)
        # inside a removed part: map to the start of the next kept interval
        for (a, b), o in zip(keeps, out_start):
            if a > src:
                return o
        return total

    # Captions: one PNG per caption run
    caps = [info["caption"]] + [c for _, c in info["marks"]]
    cap_times = [0.0] + [to_out(m) for m, _ in info["marks"]] + [total]
    spec = [{"file": f"cap_{n}_{i}.png", "kind": "caption", "title": c.split("|")[0], "caption": c.split("|", 1)[1]}
            for i, c in enumerate(caps)]
    json.dump(spec, open(os.path.join(WORK, f"spec_{n}.json"), "w"))
    subprocess.run(["swift", os.path.join(SCRIPTS, "render.swift"), os.path.join(WORK, f"spec_{n}.json"), WORK],
                   check=True, capture_output=True)

    src = os.path.join(WORK, f"{n}_phones.mp4")
    g, prev = [], None
    for i, (a, b) in enumerate(keeps):
        g.append(f"[0:v]trim=start={a:.3f}:end={b:.3f},setpts=PTS-STARTPTS,settb=AVTB,fps=30[k{i}]")
    prev, plen = "k0", keeps[0][1] - keeps[0][0]
    for i in range(1, len(keeps)):
        seg_len = keeps[i][1] - keeps[i][0]
        if joins[i - 1] == "skip":
            g.append(f"[{prev}][k{i}]xfade=transition=fade:duration={XF_SKIP}:offset={plen - XF_SKIP:.3f},settb=AVTB,fps=30[j{i}]")
            plen = plen + seg_len - XF_SKIP
        else:
            g.append(f"[{prev}][k{i}]concat=n=2:v=1,settb=AVTB,fps=30[j{i}]")
            plen = plen + seg_len
        prev = f"j{i}"
    g.append(f"[{prev}][1:v]overlay=0:0[l]")
    prev = "l"
    for i in range(len(caps)):
        s, e = cap_times[i], cap_times[i + 1]
        fades = []
        if i > 0:
            fades.append(f"fade=t=in:st={s - XF_CAP / 2:.3f}:d={XF_CAP}:alpha=1")
        if i < len(caps) - 1:
            fades.append(f"fade=t=out:st={e - XF_CAP / 2:.3f}:d={XF_CAP}:alpha=1")
        chain = ",".join(["format=rgba"] + fades)
        g.append(f"[{i + 2}:v]{chain}[c{i}]")
        g.append(f"[{prev}][c{i}]overlay=0:0:shortest=0:eof_action=repeat[o{i}]")
        prev = f"o{i}"
    inputs = ["-i", src, "-loop", "1", "-t", f"{total:.3f}", "-i", os.path.join(WORK, "labels.png")]
    for i in range(len(caps)):
        inputs += ["-loop", "1", "-t", f"{total:.3f}", "-i", os.path.join(WORK, f"cap_{n}_{i}.png")]
    out = os.path.join(WORK, f"{n}_final.mp4")
    subprocess.run(FF + inputs + ["-filter_complex", ";".join(g), "-map", f"[{prev}]", "-t", f"{total:.3f}"] + ENC + [out],
                   check=True)
    print(f"{n:4s} raw {dur:6.1f}s -> {total:5.1f}s  stills cut {sum(b - a for a, b, k in removed if k == 'cut'):5.1f}s"
          f"  skips {[(round(a, 1), round(b, 1)) for a, b, k in removed if k == 'skip']}  captions at {[round(x, 1) for x in cap_times[1:-1]]}")
    return out, total


def duration(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p],
                                capture_output=True, text=True, check=True).stdout)


if __name__ == "__main__":
    spec = [{"file": "labels.png", "kind": "labels"},
            {"file": "card_title.png", "kind": "card", "title": "Paykit: pay people, not addresses",
             "lines": ["Bitkit and a Tether WDK wallet pay each other by pubky, in Bitcoin and USD₮",
                       "Two stacks: Swift + LDK on the left, React Native + Tether WDK on the right",
                       "Bitcoin on regtest (Blocktank staging) · USD₮ on a local fork of Arbitrum One · Pubky staging",
                       "Recorded live on two iOS simulators. Waits are shortened; blocks are mined on demand."]},
            {"file": "card_end.png", "kind": "card", "title": "Two wallets, one protocol",
             "lines": ["What you saw, between two independent implementations",
                       "Pay by pubky in Bitcoin and USD₮  ·  contacts over an encrypted link  ·  private addresses",
                       "Requests both ways, settled with proofs checked on chain  ·  automatic payments  ·  a subscription",
                       "Setup: USD₮ on a local Anvil fork of Arbitrum One, with bitkit-core's test bundler and paymaster",
                       "Not stock Bitkit: a local patch adds minute schedules, USD₮-priced requests, USD₮ allowance offers",
                       "Not shown: Lightning (the WDK wallet has none)"]}]
    json.dump(spec, open(os.path.join(WORK, "spec_static.json"), "w"))
    subprocess.run(["swift", os.path.join(SCRIPTS, "render.swift"), os.path.join(WORK, "spec_static.json"), WORK], check=True)
    parts = []
    for name, secs in (("card_title", 7.0),):
        out = os.path.join(WORK, f"{name}.mp4")
        subprocess.run(FF + ["-loop", "1", "-t", str(secs), "-i", os.path.join(WORK, f"{name}.png"),
                             "-vf", "fps=30,fade=t=in:st=0:d=0.5"] + ENC + [out], check=True)
        parts.append((out, secs))
    for n in ORDER:
        parts.append(edit_clip(n))
    out = os.path.join(WORK, "card_end.mp4")
    subprocess.run(FF + ["-loop", "1", "-t", "11", "-i", os.path.join(WORK, "card_end.png"),
                         "-vf", "fps=30,fade=t=out:st=10.3:d=0.7"] + ENC + [out], check=True)
    parts.append((out, 11.0))
    # Join everything with crossfades.
    inputs, g, prev, plen = [], [], "0:v", parts[0][1]
    for p, _ in parts:
        inputs += ["-i", p]
    for i in range(1, len(parts)):
        g.append(f"[{prev}][{i}:v]xfade=transition=fade:duration={XF_CLIP}:offset={plen - XF_CLIP:.3f}[x{i}]")
        plen += parts[i][1] - XF_CLIP
        prev = f"x{i}"
    final = os.path.join(D, "paykit-wdk-bitkit-demo-v3.mp4")
    subprocess.run(FF + inputs + ["-filter_complex", ";".join(g), "-map", f"[{prev}]"] + ENC +
                   ["-movflags", "+faststart", final], check=True)
    print(f"final {final}: {duration(final):.1f}s, {os.path.getsize(final) / 1e6:.1f} MB")
