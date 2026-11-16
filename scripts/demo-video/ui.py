import json,sys,re
def onscreen(f):
    m=re.findall(r"[-\d.]+", f or "")
    return len(m)==4 and float(m[1])<874 and float(m[1])+float(m[3])>0
def walk(n):
    l=(n.get("AXLabel") or "").replace("\n"," "); i=n.get("AXUniqueId") or ""; v=n.get("AXValue") or ""; t=n.get("type") or n.get("role_description")
    if (l or i) and onscreen(n.get("AXFrame")) and t!="Application":
        print(f"{t} id={i!r} label={l[:60]!r}" + (f" value={str(v)[:40]!r}" if v else ""))
    for c in n.get("children") or []: walk(c)
for n in json.load(sys.stdin): walk(n)
