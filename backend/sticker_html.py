"""Printable sticker HTML generator for Nek Saathi bulk QR inventory.

Emits a single HTML page containing 1 or many stickers laid out in a
CSS grid, ready to print (browser's Print → Save as PDF or send to a
printing shop). Each sticker mimics the CallOwner reference layout but
with Nek Saathi's purple/cyan neon glassmorphism theme.

Public surface: ``build_sticker_html(items, variant)`` → HTML string.
"""
from __future__ import annotations

import base64
import io
from typing import Iterable

import qrcode
from qrcode.constants import ERROR_CORRECT_H


# Sticker variants — pick a colour scheme + header text.
VARIANTS: dict[str, dict[str, str]] = {
    "neon": {
        "primary": "#8B5CF6", "secondary": "#22D3EE", "accent": "#F0ABFC",
        "header_bg": "linear-gradient(135deg,#8B5CF6 0%,#22D3EE 100%)",
        "header_title": "SCAN FOR HELP",
        "header_icon": "◇",
    },
    "emergency": {
        "primary": "#DC2626", "secondary": "#F59E0B", "accent": "#FCA5A5",
        "header_bg": "linear-gradient(135deg,#DC2626 0%,#F59E0B 100%)",
        "header_title": "EMERGENCY · SCAN OWNER",
        "header_icon": "◆",
    },
    "pet": {
        "primary": "#22C55E", "secondary": "#10B981", "accent": "#86EFAC",
        "header_bg": "linear-gradient(135deg,#22C55E 0%,#10B981 100%)",
        "header_title": "IF FOUND · SCAN OWNER",
        "header_icon": "◆",
    },
    "kid": {
        "primary": "#06B6D4", "secondary": "#3B82F6", "accent": "#93C5FD",
        "header_bg": "linear-gradient(135deg,#06B6D4 0%,#3B82F6 100%)",
        "header_title": "CHILD SAFETY · SCAN PARENTS",
        "header_icon": "◇",
    },
}


def _qr_data_uri(url: str) -> str:
    """Return an inline PNG data URI encoding the given URL as a QR code."""
    q = qrcode.QRCode(
        version=None,
        error_correction=ERROR_CORRECT_H,
        box_size=10,
        border=2,
    )
    q.add_data(url)
    q.make(fit=True)
    img = q.make_image(fill_color="#06060D", back_color="#FFFFFF")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:image/png;base64,{b64}"


def _sticker_html(serial: str, url: str, palette: dict[str, str]) -> str:
    qr = _qr_data_uri(url)
    return f"""
    <div class="sticker">
      <div class="border-tape">
        <div class="header">
          <span class="header-icon">{palette['header_icon']}</span>
          <span>{palette['header_title']}</span>
          <span class="header-icon">{palette['header_icon']}</span>
        </div>
        <div class="qr-wrap">
          <img src="{qr}" alt="QR {serial}" />
        </div>
        <div class="serial">{serial}</div>
        <div class="cta">SCAN TO ALERT OWNER</div>
        <div class="masked">
          <span class="dot"></span>
          PHONE NUMBER HIDDEN
        </div>
        <div class="footer">
          <span class="brand">Nek Saathi</span>
          <span class="tag">Har musibat mein, ek Nek Saathi</span>
        </div>
      </div>
    </div>
    """


def build_sticker_html(
    items: Iterable[tuple[str, str]],
    variant: str = "neon",
    per_row: int = 3,
) -> str:
    """Build the full printable HTML page.

    ``items`` is an iterable of ``(serial_no, scan_url)`` tuples.
    """
    palette = VARIANTS.get(variant) or VARIANTS["neon"]
    body_html = "".join(_sticker_html(s, u, palette) for s, u in items)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Nek Saathi · Sticker Sheet</title>
<style>
  @page {{ size: A4; margin: 8mm; }}
  * {{ box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }}
  body {{
    margin: 0; padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #F5F5F7;
  }}
  .toolbar {{
    position: sticky; top: 0; z-index: 10;
    background: #0F0F1A; color: #F5F5F7;
    padding: 12px 20px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px;
    border-bottom: 2px solid {palette['primary']};
  }}
  .toolbar h1 {{ margin: 0; font-size: 15px; font-weight: 900; letter-spacing: 1px; }}
  .toolbar button {{
    background: {palette['header_bg']}; color: #fff; border: 0;
    padding: 10px 22px; border-radius: 999px; font-weight: 900;
    font-size: 12px; letter-spacing: 1.4px; cursor: pointer;
    box-shadow: 0 0 20px {palette['primary']}55;
  }}
  .sheet {{
    display: grid;
    grid-template-columns: repeat({per_row}, 1fr);
    gap: 10mm;
    padding: 10mm;
  }}
  .sticker {{
    width: 100%;
    aspect-ratio: 3 / 4;
    background: #FFFFFF;
    border-radius: 12px;
    padding: 4px;
    background: repeating-linear-gradient(45deg,
      {palette['primary']} 0 12px,
      #06060D 12px 24px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    page-break-inside: avoid;
  }}
  .border-tape {{
    background: #0F0F1A;
    border-radius: 8px;
    height: 100%;
    padding: 10px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    color: #F5F5F7;
    position: relative;
    overflow: hidden;
  }}
  .border-tape::before {{
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(circle at 20% 10%, {palette['primary']}22, transparent 60%),
                radial-gradient(circle at 80% 90%, {palette['secondary']}22, transparent 60%);
    pointer-events: none;
  }}
  .header {{
    background: {palette['header_bg']};
    color: #FFFFFF; font-weight: 900; font-size: 10px; letter-spacing: 1.6px;
    padding: 6px 10px; border-radius: 999px;
    display: flex; align-items: center; gap: 6px;
    box-shadow: 0 0 16px {palette['primary']}66;
    z-index: 2;
  }}
  .header-icon {{ font-size: 12px; }}
  .qr-wrap {{
    background: #FFFFFF; padding: 8px; border-radius: 10px;
    border: 2px solid {palette['primary']};
    box-shadow: 0 0 16px {palette['primary']}55;
    z-index: 2;
  }}
  .qr-wrap img {{ width: 105px; height: 105px; display: block; }}
  .serial {{
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 12px; font-weight: 900; letter-spacing: 2px;
    color: {palette['accent']};
    background: rgba(255,255,255,0.05); padding: 3px 10px; border-radius: 4px;
    border: 1px dashed {palette['primary']}77;
    z-index: 2;
  }}
  .cta {{
    color: #F5F5F7; font-size: 9px; font-weight: 800; letter-spacing: 1.2px;
    text-transform: uppercase; text-align: center; z-index: 2;
  }}
  .masked {{
    display: flex; align-items: center; gap: 5px;
    background: rgba(220,38,38,0.14); border: 1px solid rgba(220,38,38,0.5);
    color: #FCA5A5; padding: 3px 8px; border-radius: 999px;
    font-size: 8px; font-weight: 900; letter-spacing: 1.2px;
    z-index: 2;
  }}
  .masked .dot {{ width: 6px; height: 6px; border-radius: 3px; background: #DC2626; }}
  .footer {{
    margin-top: auto; text-align: center; z-index: 2;
    display: flex; flex-direction: column; gap: 2px;
  }}
  .brand {{ font-size: 11px; font-weight: 900; color: {palette['secondary']}; letter-spacing: 1px; }}
  .tag {{ font-size: 7px; color: #A1A1AA; font-weight: 700; letter-spacing: 0.5px; font-style: italic; }}
  @media print {{ .toolbar {{ display: none; }} .sheet {{ padding: 0; }} }}
</style>
</head>
<body>
  <div class="toolbar">
    <h1>Nek Saathi · Printable Sticker Sheet · variant: {variant}</h1>
    <button onclick="window.print()">🖨 Print / Save PDF</button>
  </div>
  <div class="sheet">
    {body_html}
  </div>
</body>
</html>
"""
