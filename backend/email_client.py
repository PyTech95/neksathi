"""Emergent-managed transactional email (Resend passthrough).

Usage:
    from email_client import send_email
    await send_email(
        to="user@example.com",
        subject="Reset your password",
        html="<p>...link...</p>",
    )

Failures are logged and swallowed — email failure NEVER blocks the primary
operation (login, password reset request, etc.).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from dotenv import load_dotenv

# Some callers import this module before server.py has had a chance to run
# load_dotenv, so we load explicitly here (idempotent).
load_dotenv()

logger = logging.getLogger("email")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"   # constant, never .env


def _email_key() -> str:
    return os.environ.get("EMERGENT_EMAIL_KEY", "")


def _from_name() -> str:
    return os.environ.get("EMAIL_FROM_NAME", "Nek Sathi")


async def send_email(
    to: str,
    subject: str,
    html: str,
    reply_to: Optional[str] = None,
) -> Optional[str]:
    """Send a transactional email via Emergent's managed Resend proxy.

    Returns the provider message id on success, ``None`` on failure.
    """
    if not _email_key():
        logger.warning("EMERGENT_EMAIL_KEY missing; skipping email send to %s", to)
        return None
    payload = {
        "to": [to],
        "subject": subject,
        "html": html,
        "from_name": _from_name(),
    }
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": _email_key()},
                json=payload,
            )
        if resp.status_code >= 400:
            logger.warning(
                "email send %s failed %s: %s",
                to,
                resp.status_code,
                resp.text[:200],
            )
            return None
        try:
            return resp.json().get("id")
        except Exception:
            return None
    except httpx.HTTPError as e:
        logger.warning("email send %s upstream error: %s", to, e)
        return None


def password_reset_html(reset_url: str, expires_minutes: int = 30) -> str:
    """Render the password-reset email body (inline CSS, table layout)."""
    return f"""
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#06060D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#06060D;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;background:#0F0F1A;border:1px solid #1F1F2E;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="display:inline-block;padding:6px 12px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.4);border-radius:999px;color:#8B5CF6;font-size:11px;font-weight:900;letter-spacing:1.4px;">NEK SAATHI · SECURITY</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="margin:0;color:#F5F5F7;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Reset your password</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 8px;">
        <p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">
          Someone (hopefully you) asked to reset the password for this Nek Sathi
          account. Tap the button below to choose a new password. This link
          expires in <b style="color:#F5F5F7;">{expires_minutes} minutes</b> and
          can only be used once.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:24px 32px 8px;">
        <a href="{reset_url}"
           style="display:inline-block;padding:14px 32px;background:linear-gradient(90deg,#8B5CF6 0%,#22D3EE 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;border-radius:12px;">
          Reset Password
        </a>
      </td></tr>
      <tr><td style="padding:8px 32px 24px;">
        <p style="margin:0;color:#6B6B7C;font-size:12px;line-height:1.6;">
          If the button doesn't work, paste this link into your browser:<br/>
          <span style="color:#8B5CF6;word-break:break-all;">{reset_url}</span>
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #1F1F2E;">
        <p style="margin:0;color:#6B6B7C;font-size:11px;line-height:1.6;">
          Didn't request this? You can safely ignore this email — your password
          won't change unless you tap the link above.
          <br/><br/>
          <span style="color:#8B5CF6;font-weight:700;">Har musibat mein, ek Nek Sathi.</span>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
"""
