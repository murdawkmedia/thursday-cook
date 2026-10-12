import re, json, random, html, hashlib, colorsys, sys, os
from collections import defaultdict

# Usage: python3 tree-render.py [input.md] [output_basename]
# Renders a nested markdown list into a dark, tinted-panel tree:
#   <basename>.svg         (open in a browser)
#   <basename>.excalidraw  (open via excalidraw.com -> Open)
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "personal", "scratch", "tree.md")
BASE = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(SRC)[0]
OUT_EX = BASE + ".excalidraw"
OUT_SVG = BASE + ".svg"

raw = open(SRC, encoding="utf-8").read().splitlines()

fontSize = 14
charW = 8.6
wrap_chars = 30
colW = 360
margin = 60
lineH = fontSize * 1.22
gap = 6          # gap between panel edges (not text baselines)
PAD = 8
BG = "#0f1115"

gmap = {"→": "->", "↔": "<->", "⇒": "=>", "←": "<-"}
def clean(s):
    for k, v in gmap.items(): s = s.replace(k, v)
    return s

nodes, stack = [], []
for line in raw:
    m = re.match(r'^(\s*)- (.*)$', line)
    if not m: continue
    depth = len(m.group(1)) // 2
    node = {"text": clean(m.group(2).strip()), "depth": depth, "children": [], "parent": None}
    while stack and stack[-1]["depth"] >= depth: stack.pop()
    if stack:
        stack[-1]["children"].append(node); node["parent"] = stack[-1]
    nodes.append(node); stack.append(node)

def wrap(t, n):
    out, cur = [], ""
    for w in t.split(" "):
        if cur and len(cur) + 1 + len(w) > n: out.append(cur); cur = w
        else: cur = (cur + " " + w).strip()
    if cur: out.append(cur)
    return out

# ---- layout: each column packed tight, centered on the root's centerline (y=0) ----
by_depth = defaultdict(list)
for node in nodes:
    by_depth[node["depth"]].append(node)   # DFS order preserved

for d, group in by_depth.items():
    for node in group:
        node["_lines"] = wrap(node["text"], wrap_chars)
        node["_w"] = max(len(l) for l in node["_lines"]) * charW
        node["_h"] = len(node["_lines"]) * lineH
    total = sum(n["_h"] + 2*PAD for n in group) + gap * (len(group) - 1)
    y = -total / 2.0
    for node in group:
        node["_y"] = y
        node["_x"] = margin + d * colW
        y += node["_h"] + 2*PAD + gap

# ---- one hue per column, seeded by hashing the parent node(s) ----
def hsv_hex(h, s, v):
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return "#%02x%02x%02x" % (int(r*255), int(g*255), int(b*255))

panel_fill, text_col, edge_col = {}, {}, {}
for d, group in by_depth.items():
    if d == 0:
        seed_key = "thursday"
    else:
        parents = sorted({(g["parent"]["text"] if g["parent"] else "") for g in group})
        seed_key = "|".join(parents)
    h = (int(hashlib.md5(seed_key.encode()).hexdigest(), 16) % 997) / 997.0
    h = (h + d * 0.61803398875) % 1.0
    panel_fill[d] = hsv_hex(h, 0.42, 0.14)
    text_col[d]   = hsv_hex(h, 0.70, 0.82)
    edge_col[d]   = hsv_hex(h, 0.55, 0.32)

def nid(): return "".join(random.choice("abcdefghijklmnopqrstuvwxyz0123456789") for _ in range(20))

# normalize into positive space so exports/viewers behave predictably
ymin = min(n["_y"] for n in nodes) - PAD
for n in nodes:
    n["_y"] = n["_y"] - ymin + margin

ymax = max(n["_y"] + n["_h"] for n in nodes) + PAD + margin
maxx = max(n["_x"] + n["_w"] for n in nodes) + PAD + margin

# ---- SVG ----
s = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(maxx)}" height="{int(ymax)}" '
     f'viewBox="0 0 {int(maxx)} {int(ymax)}" font-family="Menlo,Consolas,monospace">',
     f'<rect x="0" y="0" width="100%" height="100%" fill="{BG}"/>']
for node in nodes:
    px = node["_x"] + node["_w"] + PAD
    py = node["_y"] + node["_h"] / 2
    for c in node["children"]:
        cx = c["_x"] - PAD
        cy = c["_y"] + c["_h"] / 2
        mx = (px + cx) / 2
        s.append(f'<path d="M{px:.1f},{py:.1f} C{mx:.1f},{py:.1f} {mx:.1f},{cy:.1f} {cx:.1f},{cy:.1f}" '
                 f'fill="none" stroke="{edge_col[node["depth"]]}" stroke-width="1.1" opacity="0.75"/>')
for node in nodes:
    d = node["depth"]
    rx, ry = node["_x"] - PAD, node["_y"] - PAD
    rw, rh = node["_w"] + 2*PAD, node["_h"] + 2*PAD
    s.append(f'<rect x="{rx:.1f}" y="{ry:.1f}" width="{rw:.1f}" height="{rh:.1f}" rx="7" ry="7" '
             f'fill="{panel_fill[d]}" stroke="#ffffff" stroke-width="1"/>')
    for i, ln in enumerate(node["_lines"]):
        y = node["_y"] + fontSize + i * lineH
        s.append(f'<text x="{node["_x"]:.1f}" y="{y:.1f}" font-size="{fontSize}" '
                 f'fill="{text_col[d]}">{html.escape(ln)}</text>')
s.append("</svg>")
open(OUT_SVG, "w", encoding="utf-8").write("\n".join(s))

# ---- Excalidraw ----
elements = []
for node in nodes:
    d = node["depth"]
    rx, ry = node["_x"] - PAD, node["_y"] - PAD
    rw, rh = node["_w"] + 2*PAD, node["_h"] + 2*PAD
    elements.append({
        "type": "rectangle", "version": 1, "versionNonce": random.randint(1, 2**31),
        "isDeleted": False, "id": nid(), "fillStyle": "solid", "strokeWidth": 1,
        "strokeStyle": "solid", "roughness": 0, "opacity": 100, "angle": 0,
        "x": rx, "y": ry, "strokeColor": "#ffffff", "backgroundColor": panel_fill[d],
        "width": rw, "height": rh, "seed": random.randint(1, 2**31), "groupIds": [],
        "frameId": None, "roundness": {"type": 3}, "boundElements": [], "updated": 1,
        "link": None, "locked": False,
    })
    elements.append({
        "type": "text", "version": 1, "versionNonce": random.randint(1, 2**31),
        "isDeleted": False, "id": nid(), "fillStyle": "solid", "strokeWidth": 1,
        "strokeStyle": "solid", "roughness": 0, "opacity": 100, "angle": 0,
        "x": node["_x"], "y": node["_y"], "strokeColor": text_col[d],
        "backgroundColor": "transparent", "width": node["_w"], "height": node["_h"],
        "seed": random.randint(1, 2**31), "groupIds": [], "frameId": None, "roundness": None,
        "boundElements": [], "updated": 1, "link": None, "locked": False,
        "fontSize": fontSize, "fontFamily": 3, "text": "\n".join(node["_lines"]),
        "textAlign": "left", "verticalAlign": "top", "containerId": None,
        "originalText": "\n".join(node["_lines"]), "lineHeight": 1.22, "baseline": fontSize,
    })
for node in nodes:
    d = node["depth"]
    px = node["_x"] + node["_w"] + PAD
    py = node["_y"] + node["_h"] / 2
    for c in node["children"]:
        cx = c["_x"] - PAD
        cy = c["_y"] + c["_h"] / 2
        dx, dy = cx - px, cy - py
        elements.append({
            "type": "arrow", "version": 1, "versionNonce": random.randint(1, 2**31),
            "isDeleted": False, "id": nid(), "fillStyle": "solid", "strokeWidth": 1,
            "strokeStyle": "solid", "roughness": 0, "opacity": 70, "angle": 0,
            "x": px, "y": py, "strokeColor": edge_col[d], "backgroundColor": "transparent",
            "width": abs(dx), "height": abs(dy), "seed": random.randint(1, 2**31),
            "groupIds": [], "frameId": None, "roundness": {"type": 2}, "boundElements": [],
            "updated": 1, "link": None, "locked": False, "points": [[0, 0], [dx, dy]],
            "lastCommittedPoint": None, "startBinding": None, "endBinding": None,
            "startArrowhead": None, "endArrowhead": None,
        })
json.dump({"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
           "elements": elements,
           "appState": {"gridSize": None, "viewBackgroundColor": BG},
           "files": {}}, open(OUT_EX, "w", encoding="utf-8"), ensure_ascii=False)

print("nodes:", len(nodes), "elements:", len(elements))
print("per column:", {d: len(g) for d, g in sorted(by_depth.items())})
print("bounds:", int(maxx), "x", int(ymax))
print("root y / canvas center:", round(nodes[0]["_y"], 1), "/", round(ymax/2, 1))
