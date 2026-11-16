import json,sys,re
# find.py <label> [type] [index]: print centre "x y" of the matching on-screen element
label=sys.argv[1]; typ=sys.argv[2] if len(sys.argv)>2 and sys.argv[2] else None; idx=int(sys.argv[3]) if len(sys.argv)>3 else 0
hits=[]
def walk(n):
    t=n.get("type"); l=n.get("AXLabel") or ""
    if l==label and (typ is None or t==typ):
        m=[float(v) for v in re.findall(r"[-\d.]+", n.get("AXFrame") or "")]
        if len(m)==4 and m[1]<874 and m[1]+m[3]>0: hits.append((m[0]+m[2]/2, m[1]+m[3]/2))
    for c in n.get("children") or []: walk(c)
for n in json.load(sys.stdin): walk(n)
if len(hits)<=idx: sys.exit(1)
print(int(hits[idx][0]), int(hits[idx][1]))
