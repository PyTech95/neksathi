"""RFC 6350 (vCard 4.0) generator for Share Tap digital business cards.

Reference: https://datatracker.ietf.org/doc/html/rfc6350

Behavior:
    - Escapes special chars (`,` `;` `\\` `\\n`) per §3.4.
    - Folds long lines at 75 octets with a single-space continuation.
    - Emits `VERSION:4.0`.
    - Uses `TEL;TYPE=cell;VALUE=uri:tel:<E.164>` shape which iOS/Android
      Contacts apps parse cleanly.
    - Embeds photos as inline data URIs (`PHOTO:data:image/jpeg;base64,...`).
    - Ignores empty/whitespace-only fields to keep the emitted card tight.

Public surface: ``build_vcard4(card_dict) -> str``.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable


# --------------------------------------------------------------------------- #
# Utility helpers
# --------------------------------------------------------------------------- #

def _escape_text(value: str) -> str:
    """Escape a text value per RFC 6350 §3.4."""
    if value is None:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace(";", r"\;")
        .replace(",", r"\,")
        .replace("\r\n", r"\n")
        .replace("\n", r"\n")
        .replace("\r", r"\n")
    )


def _fold(line: str) -> str:
    """Fold a single logical line into physical lines <= 75 octets each.

    Continuation lines start with a single whitespace (space or tab), per
    RFC 6350 §3.2.
    """
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    out: list[str] = []
    # We fold on 75 octets, but need to be careful not to cut a UTF-8
    # multi-byte sequence — so walk the string char by char and count bytes.
    buf = ""
    buf_bytes = 0
    limit = 75
    for ch in line:
        b = len(ch.encode("utf-8"))
        if buf_bytes + b > limit:
            out.append(buf)
            buf = " " + ch          # continuation marker
            buf_bytes = 1 + b
            limit = 74              # after the continuation space
        else:
            buf += ch
            buf_bytes += b
    if buf:
        out.append(buf)
    return "\r\n".join(out)


def _split_full_name(fn: str) -> tuple[str, str]:
    """Very rough split into (first, last) — vCard N field requires a
    structured value, but a good "best-effort" split is enough for the
    tiny business-card use case. Users can always edit downstream."""
    parts = fn.strip().split()
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


# --------------------------------------------------------------------------- #
# vCard 4.0 builder
# --------------------------------------------------------------------------- #

# Well-known social handles we know how to convert into IMPP / X-SOCIALPROFILE.
_SOCIAL_URL: dict[str, callable] = {
    "twitter": lambda v: v if v.startswith("http") else f"https://twitter.com/{v.lstrip('@')}",
    "x": lambda v: v if v.startswith("http") else f"https://x.com/{v.lstrip('@')}",
    "linkedin": lambda v: v if v.startswith("http") else f"https://linkedin.com/in/{v.lstrip('@')}",
    "instagram": lambda v: v if v.startswith("http") else f"https://instagram.com/{v.lstrip('@')}",
    "github": lambda v: v if v.startswith("http") else f"https://github.com/{v.lstrip('@')}",
    "youtube": lambda v: v if v.startswith("http") else f"https://youtube.com/@{v.lstrip('@')}",
    "whatsapp": lambda v: f"https://wa.me/{''.join(c for c in v if c.isdigit())}",
    "telegram": lambda v: v if v.startswith("http") else f"https://t.me/{v.lstrip('@')}",
    "website": lambda v: v if v.startswith("http") else f"https://{v}",
}


def _photo_data_uri(photo_base64: str) -> str:
    """Guess a MIME type from the base64 magic bytes and return a data URI."""
    if not photo_base64:
        return ""
    head = photo_base64[:12]
    if head.startswith("/9j/") or head.startswith("R0lGO"):
        mime = "image/jpeg" if head.startswith("/9j/") else "image/gif"
    elif head.startswith("iVBORw0"):
        mime = "image/png"
    elif head.startswith("UklGR"):
        mime = "image/webp"
    else:
        mime = "image/jpeg"
    return f"data:{mime};base64,{photo_base64}"


def build_vcard4(c: dict[str, Any]) -> str:
    """Emit an RFC 6350 vCard 4.0 for a Nek Saathi Share Tap card.

    ``c`` is the raw Mongo document (or the CardOut model dumped to dict).
    """
    fn = (c.get("display_name") or "").strip() or "Unnamed contact"
    first, last = _split_full_name(fn)

    lines: list[str] = ["BEGIN:VCARD", "VERSION:4.0"]

    # N: family;given;additional;prefix;suffix
    lines.append(
        "N:"
        + _escape_text(last)
        + ";"
        + _escape_text(first)
        + ";;;"
    )
    lines.append("FN:" + _escape_text(fn))

    if c.get("title"):
        lines.append("TITLE:" + _escape_text(c["title"]))
    if c.get("company"):
        lines.append("ORG:" + _escape_text(c["company"]))
    if c.get("bio"):
        lines.append("NOTE:" + _escape_text(c["bio"]))

    if c.get("phone"):
        phone = c["phone"].strip()
        # If it looks like an E.164-ish string, wrap as tel URI.
        cleaned = phone.replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        if cleaned.startswith("+") or (cleaned.isdigit() and len(cleaned) >= 6):
            lines.append(f"TEL;TYPE=cell;VALUE=uri:tel:{cleaned}")
        else:
            lines.append("TEL;TYPE=cell:" + _escape_text(phone))

    if c.get("email"):
        lines.append("EMAIL;TYPE=work:" + _escape_text(c["email"]))

    if c.get("website"):
        w = c["website"].strip()
        if not w.startswith("http"):
            w = "https://" + w
        lines.append("URL;TYPE=work:" + _escape_text(w))

    if c.get("address"):
        # ADR: p.o.box;extended;street;locality;region;postal-code;country
        lines.append("ADR;TYPE=work:;;" + _escape_text(c["address"]) + ";;;;")

    # Social profiles → IMPP + X-SOCIALPROFILE (Apple ecosystem uses this)
    socials = c.get("socials") or {}
    if isinstance(socials, dict):
        for key, value in socials.items():
            if not value:
                continue
            key_l = str(key).lower().strip()
            builder = _SOCIAL_URL.get(key_l)
            if not builder:
                continue
            url = builder(str(value).strip())
            lines.append(
                f"X-SOCIALPROFILE;TYPE={key_l}:" + _escape_text(url)
            )

    # Photo — vCard 4.0 supports inline data URIs.
    if c.get("photo_base64"):
        uri = _photo_data_uri(c["photo_base64"])
        if uri:
            lines.append("PHOTO:" + uri)

    # UID + REV so contact-merging in the recipient's device is stable.
    uid = c.get("qr_id") or c.get("id")
    if uid:
        lines.append(f"UID:urn:neksaathi:card:{uid}")
    lines.append("REV:" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    # Client identifier — RFC 6350 §6.9.2. Nice-to-have; helps devs debug.
    lines.append("PRODID:-//Nek Saathi//ShareTap 1.0//EN")

    lines.append("END:VCARD")

    # Fold + join with CRLF per RFC.
    folded: list[str] = [_fold(ln) for ln in lines]
    return "\r\n".join(folded) + "\r\n"


def vcard_filename(card: dict[str, Any]) -> str:
    """Compute a safe .vcf filename for Content-Disposition."""
    name = (card.get("display_name") or "contact").strip()
    safe: Iterable[str] = (ch if (ch.isalnum() or ch in "._- ") else "_" for ch in name)
    stem = "".join(safe).strip() or "contact"
    return f"{stem}.vcf"
