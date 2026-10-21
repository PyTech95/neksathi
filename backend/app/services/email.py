"""Self-hosted transactional email over standard SMTP — no vendor lock-in.

Usage:
    from email_client import send_email
    await send_email(to="user@example.com", subject="Reset your password", html="<p>...</p>")

Configure any normal SMTP (Gmail app-password, Zoho, your VPS Postfix, Amazon SES
SMTP, etc.) via environment:
    SMTP_HOST        e.g. smtp.gmail.com
    SMTP_PORT        default 587 (STARTTLS) ; use 465 for implicit SSL
    SMTP_USER        login username
    SMTP_PASS        login password / app-password
    EMAIL_FROM       from address   (default: SMTP_USER)
    EMAIL_FROM_NAME  display name    (default: "Nek Sathi")

Failures are logged and swallowed — email failure NEVER blocks the primary
operation. If SMTP is not configured, send is skipped and ``None`` is returned
(the caller then falls back to a dev token).
"""
from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

from dotenv import load_dotenv

load_dotenv()  # idempotent; some callers import before server.py runs it

logger = logging.getLogger("email")


def _cfg() -> dict:
    return {
        "host": os.environ.get("SMTP_HOST", ""),
        "port": int(os.environ.get("SMTP_PORT", "587") or "587"),
        "user": os.environ.get("SMTP_USER", ""),
        "pass": os.environ.get("SMTP_PASS", ""),
        "from": os.environ.get("EMAIL_FROM") or os.environ.get("SMTP_USER", ""),
        "from_name": os.environ.get("EMAIL_FROM_NAME", "Nek Sathi"),
    }


def _send_sync(cfg: dict, to: str, subject: str, html: str, reply_to: Optional[str]) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f'{cfg["from_name"]} <{cfg["from"]}>'
    msg["To"] = to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content("This email requires an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=ssl.create_default_context(), timeout=20) as s:
            if cfg["user"]:
                s.login(cfg["user"], cfg["pass"])
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=20) as s:
            s.ehlo()
            try:
                s.starttls(context=ssl.create_default_context())
                s.ehlo()
            except smtplib.SMTPException:
                pass  # server without STARTTLS (e.g. local relay)
            if cfg["user"]:
                s.login(cfg["user"], cfg["pass"])
            s.send_message(msg)


async def send_email(
    to: str,
    subject: str,
    html: str,
    reply_to: Optional[str] = None,
) -> Optional[str]:
    """Send a transactional email via SMTP. Returns a message id on success, None on failure."""
    cfg = _cfg()
    if not cfg["host"] or not cfg["from"]:
        logger.warning("SMTP not configured (SMTP_HOST / EMAIL_FROM); skipping email to %s", to)
        return None
    try:
        await asyncio.to_thread(_send_sync, cfg, to, subject, html, reply_to)
        return "sent"
    except Exception as e:
        logger.warning("email send to %s failed: %s", to, e)
        return None


def email_verify_otp_html(code: str, expires_minutes: int = 10) -> str:
    """Render the email-verification OTP email (6-digit code, inline CSS, brand red)."""
    return f"""
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#06060D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#06060D;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;background:#0F0F1A;border:1px solid #1F1F2E;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="display:inline-block;padding:6px 12px;background:rgba(233,37,70,0.15);border:1px solid rgba(233,37,70,0.4);border-radius:999px;color:#ff5a74;font-size:11px;font-weight:900;letter-spacing:1.4px;">NEK SATHI · VERIFY EMAIL</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="margin:0;color:#F5F5F7;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Confirm your email</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 8px;">
        <p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">
          Use the 6-digit code below to verify this email address for your Nek
          Sathi account. It expires in <b style="color:#F5F5F7;">{expires_minutes} minutes</b>.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 8px;">
        <div style="display:inline-block;padding:16px 28px;background:#0A0A14;border:1px solid rgba(233,37,70,0.4);border-radius:14px;color:#ffffff;font-size:34px;font-weight:900;letter-spacing:10px;">{code}</div>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #1F1F2E;">
        <p style="margin:0;color:#6B6B7C;font-size:11px;line-height:1.6;">
          Didn't ask to use this email on Nek Sathi? You can ignore this message.
          <br/><br/>
          <span style="color:#ff5a74;font-weight:700;">Har musibat mein, ek Nek Sathi.</span>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
"""


def password_reset_otp_html(code: str, expires_minutes: int = 5) -> str:
    """Render the password-reset OTP email (6-digit code, inline CSS, brand red)."""
    return f"""
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#06060D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#06060D;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;background:#0F0F1A;border:1px solid #1F1F2E;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="display:inline-block;padding:6px 12px;background:rgba(233,37,70,0.15);border:1px solid rgba(233,37,70,0.4);border-radius:999px;color:#ff5a74;font-size:11px;font-weight:900;letter-spacing:1.4px;">NEK SATHI · SECURITY</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;">
        <h1 style="margin:0;color:#F5F5F7;font-size:26px;font-weight:900;letter-spacing:-0.5px;">Your reset code</h1>
      </td></tr>
      <tr><td style="padding:16px 32px 8px;">
        <p style="margin:0;color:#A1A1AA;font-size:14px;line-height:1.6;">
          Someone (hopefully you) asked to reset the password for this Nek Sathi
          account. Enter the 6-digit code below in the app to continue. It
          expires in <b style="color:#F5F5F7;">{expires_minutes} minutes</b> and
          can only be used once.
        </p>
      </td></tr>
      <tr><td align="center" style="padding:20px 32px 8px;">
        <div style="display:inline-block;padding:16px 28px;background:#0A0A14;border:1px solid rgba(233,37,70,0.4);border-radius:14px;color:#ffffff;font-size:34px;font-weight:900;letter-spacing:10px;">{code}</div>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #1F1F2E;">
        <p style="margin:0;color:#6B6B7C;font-size:11px;line-height:1.6;">
          Didn't request this? You can safely ignore this email — your password
          won't change unless you enter this code.
          <br/><br/>
          <span style="color:#ff5a74;font-weight:700;">Har musibat mein, ek Nek Sathi.</span>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
"""


def password_reset_html(reset_url: str, expires_minutes: int = 30) -> str:
    """Render the password-reset email body (inline CSS, table layout, brand red)."""
    return f"""
<!doctype html>
<html>
<body style="margin:0;padding:0;background:#06060D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#06060D;padding:40px 16px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="max-width:480px;background:#0F0F1A;border:1px solid #1F1F2E;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:32px 32px 8px;">
        <div style="display:inline-block;padding:6px 12px;background:rgba(233,37,70,0.15);border:1px solid rgba(233,37,70,0.4);border-radius:999px;color:#ff5a74;font-size:11px;font-weight:900;letter-spacing:1.4px;">NEK SATHI · SECURITY</div>
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
           style="display:inline-block;padding:14px 32px;background:linear-gradient(90deg,#b3122f 0%,#e92546 100%);color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;border-radius:12px;">
          Reset Password
        </a>
      </td></tr>
      <tr><td style="padding:8px 32px 24px;">
        <p style="margin:0;color:#6B6B7C;font-size:12px;line-height:1.6;">
          If the button doesn't work, paste this link into your browser:<br/>
          <span style="color:#ff5a74;word-break:break-all;">{reset_url}</span>
        </p>
      </td></tr>
      <tr><td style="padding:24px 32px;border-top:1px solid #1F1F2E;">
        <p style="margin:0;color:#6B6B7C;font-size:11px;line-height:1.6;">
          Didn't request this? You can safely ignore this email — your password
          won't change unless you tap the link above.
          <br/><br/>
          <span style="color:#ff5a74;font-weight:700;">Har musibat mein, ek Nek Sathi.</span>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
"""
