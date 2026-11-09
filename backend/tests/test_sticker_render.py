"""Unit tests for the QR sticker renderer used by the customer-facing
/me/vehicles|tags/{id}/sticker.png|pdf endpoints (render → PNG, PNG → PDF).

Standalone: sticker.py only needs qrcode + PIL + the baked assets, so we load
it directly (no app wiring / DB / live server)."""
import io
import re
import importlib.util
import pathlib

from PIL import Image

_P = pathlib.Path(__file__).resolve().parents[1] / "app" / "services" / "sticker.py"
_spec = importlib.util.spec_from_file_location("sticker_under_test", _P)
sticker = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sticker)


def test_render_sticker_returns_valid_png():
    png = sticker.render_sticker("https://neksathi.in/scan/abc123", "654321")
    assert isinstance(png, (bytes, bytearray)) and len(png) > 1000
    assert bytes(png[:8]) == b"\x89PNG\r\n\x1a\n"       # PNG magic
    img = Image.open(io.BytesIO(png))
    assert img.format == "PNG"
    assert img.width > 200 and img.height > 200        # full sticker canvas


def test_render_sticker_tag_title_variant():
    png = sticker.render_sticker("https://neksathi.in/t/xyz", "111222", title="Safety QR Tag")
    assert bytes(png[:8]) == b"\x89PNG\r\n\x1a\n"
    assert Image.open(io.BytesIO(png)).format == "PNG"


def test_render_sticker_is_deterministic():
    a = sticker.render_sticker("https://neksathi.in/scan/same", "000111")
    b = sticker.render_sticker("https://neksathi.in/scan/same", "000111")
    assert a == b                                      # same url+code+title ⇒ identical bytes


def test_png_converts_to_pdf():
    png = sticker.render_sticker("https://neksathi.in/scan/pdfcheck", "999000")
    img = Image.open(io.BytesIO(png)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PDF", resolution=150.0)
    pdf = buf.getvalue()
    assert pdf[:5] == b"%PDF-"                          # PDF magic
    assert len(pdf) > 1000


def test_new_sticker_code_is_6_digits():
    for _ in range(25):
        assert re.fullmatch(r"\d{6}", sticker.new_sticker_code())
