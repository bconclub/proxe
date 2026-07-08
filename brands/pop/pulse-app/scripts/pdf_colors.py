import fitz, collections, os, sys

PDF = r"C:\Users\user\Desktop\PUNJAB YATRA 2026 (1).pdf"
OUT = r"C:\Users\user\Builds\Punjab\.pdf_pages"
os.makedirs(OUT, exist_ok=True)

doc = fitz.open(PDF)
print("pages:", doc.page_count)

# 1) Render first pages to PNG so they can be viewed.
for i in range(min(4, doc.page_count)):
    pg = doc[i]
    pix = pg.get_pixmap(matrix=fitz.Matrix(1.4, 1.4))
    pix.save(os.path.join(OUT, f"page{i+1}.png"))

# 2) Pixel histogram across the first 14 pages (captures images + vectors).
hist = collections.Counter()
def bucket(c): return (c // 12) * 12  # quantize to ~12 steps
for i in range(min(14, doc.page_count)):
    pg = doc[i]
    pix = pg.get_pixmap(matrix=fitz.Matrix(0.5, 0.5))  # small = fast
    n = pix.n  # components
    data = pix.samples
    step = n  # iterate pixels
    for p in range(0, len(data) - n + 1, step * 3):  # sample every 3rd pixel
        r, g, b = data[p], data[p+1], data[p+2]
        # skip near-white and near-black (paper + text)
        if r > 240 and g > 240 and b > 240: continue
        if r < 18 and g < 18 and b < 18: continue
        hist[(bucket(r), bucket(g), bucket(b))] += 1

print("\n=== TOP PIXEL COLORS (hex : count) ===")
for (r, g, b), cnt in hist.most_common(30):
    print(f"#{r:02X}{g:02X}{b:02X} : {cnt}")

# 3) Vector fill/stroke colors from drawings (logos, shapes).
vec = collections.Counter()
def tohex(c):
    if not c: return None
    r, g, b = [max(0, min(255, round(x*255))) for x in c]
    return f"#{r:02X}{g:02X}{b:02X}"
for i in range(min(20, doc.page_count)):
    for d in doc[i].get_drawings():
        for key in ("fill", "color"):
            h = tohex(d.get(key))
            if h and h not in ("#FFFFFF", "#000000"):
                vec[h] += 1
print("\n=== TOP VECTOR FILL/STROKE COLORS ===")
for h, cnt in vec.most_common(20):
    print(f"{h} : {cnt}")
