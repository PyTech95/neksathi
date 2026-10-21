#!/usr/bin/env python3
"""Bake the Nek Sathi RED/BLACK/WHITE sticker TEMPLATE from the approved design.

Recolours the yellow source to red/black/white, redraws the logo, headline,
divider, card header, triangles and the neksathi.in pill crisply, and leaves
the QR panel blank (white) with no CODE badge. The runtime renderer
(backend/sticker.py) then injects a fresh scannable QR + the order's unique
6-digit CODE per order.

    cd backend/assets && python3 bake_template.py
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy import ndimage

HERE = __file__.rsplit("/", 1)[0]
SRC = f"{HERE}/sticker_source_yellow.png"
FT = f"{HERE}/fonts"
OUT = f"{HERE}/sticker_template.png"
SCAN_TOP = 1122

RED = np.array([236, 14, 20], float)
BLACK = np.array([11, 11, 15], float)
WHITE = np.array([255, 255, 255], float)
R3, B3, W3 = (236, 14, 20), (11, 11, 15), (255, 255, 255)


def recolor_emblem():
    m = np.asarray(Image.open(f"{HERE}/logo-mark.png").convert("RGBA")).astype(np.int16)
    r, g, b, al = m[..., 0], m[..., 1], m[..., 2], m[..., 3]
    lm = 0.299 * r + 0.587 * g + 0.114 * b
    is_red = (r - np.maximum(g, b)) > 45
    nw = (r > 232) & (g > 232) & (b > 232)
    wv = np.clip(212 + lm * 0.5, 205, 255)
    o = np.zeros_like(m, np.uint8)
    o[..., 0] = np.where(is_red, 236, wv)
    o[..., 1] = np.where(is_red, 14, wv)
    o[..., 2] = np.where(is_red, 20, wv)
    a2 = al.copy(); a2[nw] = 0; o[..., 3] = a2.astype(np.uint8)
    return Image.fromarray(o, "RGBA")


def _rtri_mask(S, blur):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).polygon([(S * 0.5, S * 0.08), (S * 0.07, S * 0.92), (S * 0.93, S * 0.92)], fill=255)
    return m.filter(ImageFilter.GaussianBlur(blur)).point(lambda p: 255 if p > 120 else 0)


def triangle_icon(size):
    SS = 4; S = size * SS
    wm = _rtri_mask(S, S * 0.05)
    bw = int(S * 0.085)
    rs = _rtri_mask(S, S * 0.05).resize((S - 2 * bw, S - 2 * bw), Image.LANCZOS).point(lambda p: 255 if p > 120 else 0)
    rf = Image.new("L", (S, S), 0); rf.paste(rs, (bw, int(bw * 1.15)))
    ic = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    wl = Image.new("RGBA", (S, S), (255, 255, 255, 255)); wl.putalpha(wm); ic = Image.alpha_composite(ic, wl)
    rl = Image.new("RGBA", (S, S), (236, 14, 20, 255)); rl.putalpha(rf); ic = Image.alpha_composite(ic, rl)
    ImageDraw.Draw(ic).text((S * 0.5, S * 0.60), "!", font=ImageFont.truetype(f"{FT}/PoppinsXB.ttf", int(S * 0.42)), fill=(255, 255, 255), anchor="mm")
    return ic.resize((size, size), Image.LANCZOS)


def rrect(x0, y0, x1, y1, r, W, H):
    m = Image.new("L", (W, H), 0)
    ImageDraw.Draw(m).rounded_rectangle([x0, y0, x1, y1], radius=r, fill=255)
    return np.asarray(m) > 128


def bake():
    a = np.asarray(Image.open(SRC).convert("RGB")).astype(float)
    H, W, _ = a.shape
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    L = 0.299 * R + 0.587 * G + 0.114 * B
    nearwhite = (R > 200) & (G > 200) & (B > 200)
    red = (R > 150) & (G < 110) & (B < 110)
    yellow = (R > 165) & (G > 165) & (B < 135)
    black = (R < 72) & (G < 72) & (B < 72)

    inset = 50
    inner_panel = rrect(inset, inset, W - 1 - inset, H - 1 - inset, 36, W, H)
    border = ~inner_panel
    card = rrect(158, 548, 864, 1200, 16, W, H)
    inner = inner_panel & ~card

    out = a.copy()
    ink = np.clip((135 - L) / 95, 0, 1)[..., None]
    rb = border & ~red & ~nearwhite
    out[rb] = (BLACK * ink + RED * (1 - ink))[rb]
    ri = inner & ~red & ~nearwhite
    out[ri] = (WHITE * ink + BLACK * (1 - ink))[ri]
    rc = card & ~red & ~nearwhite
    out[rc] = (BLACK * ink + WHITE * (1 - ink))[rc]
    allm = border | inner | card
    out[red & allm] = RED
    out[nearwhite & (border | card)] = WHITE
    out[nearwhite & inner] = BLACK

    # triangles (yellow blobs) -> red in the recolour (replaced by crisp icons below)
    lbl, n = ndimage.label(yellow & inner)
    for i in range(1, n + 1):
        ys, xs = np.where(lbl == i)
        if len(xs) < 300:
            continue
        cy, cx = ys.mean(), xs.mean()
        if 250 < cy < 440 and (cx < 320 or cx > 700) and len(xs) < 60000:
            out[ys, xs] = RED
    lbl2, n2 = ndimage.label(black & inner)
    best = None
    for i in range(1, n2 + 1):
        ys, xs = np.where(lbl2 == i)
        if len(ys) and ys.mean() > 1320 and len(xs) > 4000:
            if best is None or len(xs) > best[0]:
                best = (len(xs), ys, xs)
    if best:
        out[best[1], best[2]] = RED

    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    POPXB = ImageFont.truetype(f"{FT}/PoppinsXB.ttf", 46)
    POPB = ImageFont.truetype(f"{FT}/PoppinsBold.ttf", 42)
    ARCH = f"{FT}/ArchivoBlack.ttf"

    def fit(text, target, fp):
        s = 120
        while s > 30:
            f = ImageFont.truetype(fp, s)
            if d.textlength(text, font=f) <= target:
                return f
            s -= 2
        return ImageFont.truetype(fp, 30)

    # emblem (clean, a little smaller, same place)
    d.rectangle([104, 54, 356, 276], fill=B3)
    emb = recolor_emblem().resize((188, 188), Image.LANCZOS)
    img.paste(emb, (239 - 94, 179 - 94), emb)

    # headline zone + triangles
    d.rectangle([64, 284, 960, 474], fill=B3)
    d.rectangle([78, 276, 216, 394], fill=B3)
    d.rectangle([808, 276, 946, 394], fill=B3)
    tri = triangle_icon(122)
    img.paste(tri, (147 - 61, 335 - 61), tri)
    img.paste(tri, (875 - 61, 335 - 61), tri)
    d.text((512, 323), "IN CASE OF", font=fit("IN CASE OF", 428, ARCH), fill=W3, anchor="mm")
    d.text((512, 407), "EMERGENCY", font=fit("EMERGENCY", 562, ARCH), fill=W3, anchor="mm")
    d.rectangle([104, 449, 920, 455], fill=R3)                       # divider
    # red card top (header + frame) with clean rounded top corners,
    # and the white interior top with matching rounded corners — this removes
    # the black notch where the straight header met the rounded card.
    d.rounded_rectangle([155, 460, 868, 650], radius=30, fill=R3)   # left edge matches raster (x155) -> no step
    d.rounded_rectangle([167, 553, 856, 690], radius=18, fill=W3)
    d.text((512, 509), "Vehicle Safety QR", font=POPXB, fill=W3, anchor="mm")

    # blank the QR panel (runtime injects a fresh QR + CODE here)
    d.rectangle([168, 566, 856, SCAN_TOP - 8], fill=W3)

    # neksathi.in pill — globe + text centred (wipe stops above the bottom
    # tagline at y1438 so its top matras are never clipped)
    d.rectangle([205, 1352, 820, 1434], fill=B3)
    pw, ph = 556, 70; px = 512 - pw // 2; pcy = 1397; py = pcy - ph // 2
    d.rounded_rectangle([px, py, px + pw, py + ph], radius=ph // 2, fill=R3)
    gr = 23; globe_w = 2 * gr; ggap = 20
    txt_w = d.textlength("neksathi.in", font=POPB)
    grp_w = globe_w + ggap + txt_w
    sx = px + (pw - grp_w) / 2
    gcx, gcy = sx + gr, pcy
    d.ellipse([gcx - gr, gcy - gr, gcx + gr, gcy + gr], outline=W3, width=4)
    d.ellipse([gcx - gr * 0.42, gcy - gr, gcx + gr * 0.42, gcy + gr], outline=W3, width=3)
    d.line([(gcx - gr, gcy), (gcx + gr, gcy)], fill=W3, width=3)
    d.line([(gcx - gr * 0.86, gcy - gr * 0.5), (gcx + gr * 0.86, gcy - gr * 0.5)], fill=W3, width=3)
    d.line([(gcx - gr * 0.86, gcy + gr * 0.5), (gcx + gr * 0.86, gcy + gr * 0.5)], fill=W3, width=3)
    d.text((sx + globe_w + ggap, pcy + 1), "neksathi.in", font=POPB, fill=W3, anchor="lm")

    img.save(OUT)
    print("baked", OUT, img.size)


if __name__ == "__main__":
    bake()
