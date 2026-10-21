"""Runtime Nek Sathi QR-sticker renderer (red/black/white design).

Loads the pre-baked template (``assets/sticker_template.png``) and paints a
fresh, scannable QR + the order's unique 6-digit CODE onto it. For a tag
sticker pass ``title="Safety QR Tag"`` and the red header band is repainted.

    png_bytes = render_sticker("https://neksathi.in/scan/<qr_id>", "123456")
"""
from __future__ import annotations

import io
import os

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from PIL import Image, ImageDraw, ImageFont

_HERE = os.path.dirname(os.path.abspath(__file__))


def _find_assets() -> str:
    """Locate the baked ``assets/`` folder regardless of where this module
    lives. After the package refactor sticker.py sits in app/services/ while
    assets/ stays at the backend root, so we search a few sensible candidates
    (and honour STICKER_ASSETS_DIR if set)."""
    env = os.environ.get("STICKER_ASSETS_DIR", "").strip()
    cands = [env] if env else []
    cands += [
        os.path.join(_HERE, "assets"),                                  # app/services/assets (old layout)
        os.path.abspath(os.path.join(_HERE, "..", "..", "assets")),     # backend/assets (current)
        os.path.abspath(os.path.join(_HERE, "..", "..", "..", "assets")),
    ]
    for c in cands:
        if c and os.path.isfile(os.path.join(c, "sticker_template.png")):
            return c
    return os.path.join(_HERE, "assets")


_ASSETS = _find_assets()
_TEMPLATE = os.path.join(_ASSETS, "sticker_template.png")
_MARK = os.path.join(_ASSETS, "logo-mark.png")

RED = (236, 14, 20)
WHITE = (255, 255, 255)

# Geometry (template is a fixed 1024x1536 canvas)
QR_CX = 512          # QR centre x
QR_TOP = 576         # QR top y
QR_TARGET = 466      # nominal QR side
SCAN_TOP = 1122      # top of the lock / "SCAN TO CONNECT" line
HDR = (180, 470, 844, 549)   # inner red header band (wipe + retitle for tags)

_FONT_PATHS = [
    os.path.join(_ASSETS, "fonts", "PoppinsBold.ttf"),
    os.path.join(_ASSETS, "font-bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
_FONT_XB = [
    os.path.join(_ASSETS, "fonts", "PoppinsXB.ttf"),
    os.path.join(_ASSETS, "fonts", "PoppinsBold.ttf"),
    os.path.join(_ASSETS, "font-bold.ttf"),
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _font(size: int, paths=_FONT_PATHS) -> ImageFont.FreeTypeFont:
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def _make_qr(url: str) -> Image.Image:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    n = qr.modules_count + 2
    box = max(1, round(QR_TARGET / n))
    qr.box_size = box
    side = box * n
    q = qr.make_image(fill_color="black", back_color="white").convert("RGB")
    try:
        mark = Image.open(_MARK).convert("RGBA")
        ms = int(side * 0.19)
        mark = mark.resize((ms, ms))
        qd = ImageDraw.Draw(q)
        halo = int(ms * 1.42)
        qd.rounded_rectangle(
            [(side - halo) // 2, (side - halo) // 2, (side + halo) // 2, (side + halo) // 2],
            radius=int(side * 0.05), fill="white")
        q.paste(mark, ((side - ms) // 2, (side - ms) // 2), mark)
    except Exception:
        pass
    return q


_TEMPLATE_CACHE = None


def _template() -> "Image.Image":
    """Decode the baked template once and reuse (fast for bulk sheets)."""
    global _TEMPLATE_CACHE
    if _TEMPLATE_CACHE is None:
        _TEMPLATE_CACHE = Image.open(_TEMPLATE).convert("RGB")
    return _TEMPLATE_CACHE.copy()


def render_sticker(url: str, code: str, title: str | None = None) -> bytes:
    """Return PNG bytes of the finished sticker for ``url`` with ``code`` printed.
    Deterministic: same url+code+title always yields the same image.
    """
    img = _template()
    d = ImageDraw.Draw(img)

    # optional: repaint the red header band with a custom title (tags)
    if title:
        d.rectangle(list(HDR), fill=RED)
        d.text(((HDR[0] + HDR[2]) // 2, (HDR[1] + HDR[3]) // 2 + 1),
               title, font=_font(46, _FONT_XB), fill=WHITE, anchor="mm")

    # fresh QR
    q = _make_qr(url)
    side = q.width
    img.paste(q, (QR_CX - side // 2, QR_TOP))
    qbot = QR_TOP + side

    # unique CODE badge, centred between the QR bottom and the SCAN line
    mid = (qbot + SCAN_TOP) // 2
    cbw, cbh = 300, 48
    bx = QR_CX - cbw // 2
    cy0, cy1 = mid - cbh // 2, mid + cbh // 2
    d.rounded_rectangle([bx, cy0, bx + cbw, cy1], radius=20, fill=RED)
    d.text((QR_CX, (cy0 + cy1) // 2 + 1),
           f"CODE: {code}", font=_font(28), fill=WHITE, anchor="mm")

    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def new_sticker_code() -> str:
    """A unique-ish printable 6-digit code (uniqueness enforced per-order in DB)."""
    import random
    return f"{random.randint(0, 999999):06d}"