from __future__ import annotations

from datetime import timedelta, timezone
import asyncio
import os
from typing import Optional
from app.services import comms
from app.services.email import send_email
from app.config import log
from app.db import db
from app.services.fcm import send_push
from app.services.geo import _ist_now
from app.services.notify import notify_whatsapp, send_sms
from app.utils import new_id, now_utc


SOS_ESCALATION_MIN = 3


async def _guardian_of(user_id: str) -> Optional[dict]:
    fm = await db.family_members.find_one({"user_id": user_id})
    if not fm:
        return None
    fam = await db.families.find_one({"id": fm["family_id"]})
    if not fam or not fam.get("guardian_id") or fam["guardian_id"] == user_id:
        return None
    return await db.users.find_one({"id": fam["guardian_id"]})


async def _family_of(user_id: str) -> Optional[dict]:
    fm = await db.family_members.find_one({"user_id": user_id})
    if not fm:
        return None
    return await db.families.find_one({"id": fm["family_id"]})


async def _escalate_sos(sos: dict):
    owner = await db.users.find_one({"id": sos["user_id"]})
    who = (owner or {}).get("name") or "A Nek Sathi user"
    loc = ""
    if sos.get("latitude") is not None:
        loc = f" Location: https://maps.google.com/?q={sos['latitude']},{sos['longitude']}."
    body = (f"🆘 UNANSWERED SOS from {who}! They raised an SOS {SOS_ESCALATION_MIN} minutes ago "
            f"and it's still not handled.{loc} Please respond now.")
    guardian = await _guardian_of(sos["user_id"])
    targets = []
    if guardian and guardian.get("phone"):
        targets.append(guardian["phone"])
    else:
        async for c in db.emergency_contacts.find({"user_id": sos["user_id"]}).sort([("is_primary", -1)]).limit(1):
            if c.get("phone"):
                targets.append(c["phone"])
    for phone in targets:
        try:
            await notify_whatsapp(phone, body, meta={"kind": "sos_escalation", "user_id": sos["user_id"]})
        except Exception:
            pass
        try:
            await send_sms(phone, body, meta={"kind": "sos_escalation", "user_id": sos["user_id"]})
        except Exception:
            pass
    # Ring the guardian/primary contact with a spoken SOS message (Vobiz).
    if targets and comms.vobiz_live():
        token = new_id()
        await db.sos_call_sessions.insert_one({"token": token, "sos_id": sos["id"],
                                               "message": f"Urgent. {who} raised an S O S on Nek Sathi and has not responded. Please check on them immediately.",
                                               "created_at": now_utc()})
        base = (os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
        try:
            await comms.vobiz_place_call(comms.e164(targets[0]), f"{base}/api/vobiz/sos-answer?token={token}")
        except Exception as _e:
            log.warning("sos escalation call failed: %s", _e)
    if guardian:
        try:
            await send_push(recipients=[guardian["id"]], data={"title": "🆘 Unanswered SOS", "message": body, "action_url": "/safety"}, idempotency_key=new_id())
        except Exception:
            pass


async def _sos_escalation_scanner():
    """Every 30s, escalate SOS events still unacknowledged after the owner's
    family-chosen delay (default 3 min). Each SOS escalates once. A 60-min floor
    prevents ancient/historical events from escalating on restart."""
    while True:
        try:
            now = now_utc()
            floor = now - timedelta(minutes=60)
            async for sos in db.sos_events.find({"acknowledged": {"$ne": True}, "escalated": {"$ne": True},
                                                 "created_at": {"$gt": floor}}):
                fam = await _family_of(sos["user_id"])
                mins = int((fam or {}).get("sos_escalation_min", SOS_ESCALATION_MIN))
                created = sos["created_at"]
                if created.tzinfo is None:
                    created = created.replace(tzinfo=timezone.utc)
                if (now - created) < timedelta(minutes=mins):
                    continue
                await db.sos_events.update_one({"id": sos["id"]}, {"$set": {"escalated": True, "escalated_at": now_utc()}})
                await _escalate_sos(sos)
        except Exception as e:
            log.warning("sos escalation scanner: %s", e)
        await asyncio.sleep(30)


async def _build_family_digest(fam: dict) -> dict:
    since = now_utc() - timedelta(days=7)
    member_ids = [m["user_id"] async for m in db.family_members.find({"family_id": fam["id"]})]
    q = {"user_id": {"$in": member_ids}, "created_at": {"$gte": since}}
    visits = await db.geofence_events.count_documents({**q, "type": "enter"})
    sos = await db.sos_events.count_documents(q)
    low_batt = await db.activity_reports.count_documents({**q, "type": "battery", "battery": {"$lte": 20}})
    top = {}
    async for e in db.geofence_events.find({**q, "type": "enter"}):
        k = e.get("zone_name", "a place")
        top[k] = top.get(k, 0) + 1
    top_places = [{"name": k, "count": v} for k, v in sorted(top.items(), key=lambda x: -x[1])[:3]]
    return {"family_name": fam["name"], "period_days": 7, "members": len(member_ids),
            "place_visits": visits, "sos_events": sos, "low_battery": low_batt, "top_places": top_places}


def _digest_text(d: dict) -> str:
    lines = [f"📅 Nek Sathi weekly safety recap — {d['family_name']} (last 7 days):",
             f"• Place visits: {d['place_visits']}",
             f"• SOS alerts: {d['sos_events']}",
             f"• Low-battery moments: {d['low_battery']}"]
    if d["top_places"]:
        lines.append("Most visited: " + ", ".join(f"{p['name']} ({p['count']})" for p in d["top_places"]))
    lines.append("Stay safe with Nek Sathi 💜")
    return "\n".join(lines)


def _digest_html(d: dict) -> str:
    rows = "".join(f"<tr><td style='padding:6px 14px 6px 0'>{lbl}</td><td style='font-weight:700'>{val}</td></tr>"
                   for lbl, val in [("📍 Place visits", d["place_visits"]), ("🚨 SOS alerts", d["sos_events"]),
                                    ("🔋 Low-battery moments", d["low_battery"])])
    top = ""
    if d["top_places"]:
        top = "<p style='color:#555'>Most visited: " + ", ".join(f"{p['name']} ({p['count']})" for p in d["top_places"]) + "</p>"
    return (f"<div style='font-family:sans-serif;max-width:480px'>"
            f"<h2>📅 Weekly safety recap</h2>"
            f"<p><b>{d['family_name']}</b> · last 7 days</p>"
            f"<table style='font-size:15px'>{rows}</table>{top}"
            f"<p style='color:#7c3aed'>Stay safe with Nek Sathi 💜</p></div>")


async def _send_family_digest(fam: dict) -> dict:
    d = await _build_family_digest(fam)
    body = _digest_text(d)
    html = _digest_html(d)
    sent, emailed = 0, 0
    async for m in db.family_members.find({"family_id": fam["id"]}):
        u = await db.users.find_one({"id": m["user_id"]})
        if not u:
            continue
        if u.get("phone"):
            try:
                await notify_whatsapp(u["phone"], body, meta={"kind": "digest", "family_id": fam["id"]})
                sent += 1
            except Exception:
                pass
        # Also email real inboxes (skip phone-placeholder addresses) so families
        # without WhatsApp still get the recap.
        email = u.get("email")
        if email and not email.endswith("@phone.neksaathi.app"):
            try:
                await send_email(email, "📅 Nek Sathi — your weekly safety recap", html)
                emailed += 1
            except Exception:
                pass
    return {"sent": sent, "emailed": emailed, "digest": d}


async def _digest_scheduler():
    """Every 30 min, send each circle its weekly recap on the guardian's chosen
    day + hour (IST), once per ISO week (deduped via db.digest_log)."""
    while True:
        try:
            ist = _ist_now()
            week = ist.strftime("%G-W%V")
            async for fam in db.families.find({}):
                day = int(fam.get("digest_day", 6))
                hour = int(fam.get("digest_hour", 9))
                if ist.weekday() == day and ist.hour >= hour:
                    if not await db.digest_log.find_one({"family_id": fam["id"], "week": week}):
                        await _send_family_digest(fam)
                        await db.digest_log.update_one({"family_id": fam["id"], "week": week},
                                                       {"$set": {"sent_at": now_utc(), "auto": True}}, upsert=True)
        except Exception as e:
            log.warning("digest scheduler: %s", e)
        await asyncio.sleep(1800)


async def _checkin_nudge_scanner():
    """Auto-nudge a member who hasn't answered a guardian's check-in within 2
    minutes (once per check-in)."""
    while True:
        try:
            now = now_utc()
            cutoff = now - timedelta(minutes=2)
            floor = now - timedelta(minutes=60)
            async for ci in db.check_ins.find({"status": "pending", "auto_nudged": {"$ne": True},
                                               "created_at": {"$lt": cutoff, "$gt": floor}}):
                await db.check_ins.update_one({"id": ci["id"]}, {"$set": {"auto_nudged": True}})
                await db.nudges.update_many({"member_user_id": ci["member_user_id"], "active": True}, {"$set": {"active": False}})
                nd = {"id": new_id(), "family_id": ci["family_id"], "guardian_id": ci["guardian_id"],
                      "guardian_name": ci.get("guardian_name"), "member_user_id": ci["member_user_id"],
                      "active": True, "auto": True, "created_at": now_utc()}
                await db.nudges.insert_one(dict(nd))
                mu = await db.users.find_one({"id": ci["member_user_id"]})
                msg = f"{ci.get('guardian_name','Your guardian')} is still waiting — please reply to the check-in."
                try:
                    await send_push(recipients=[ci["member_user_id"]], data={"title": "🔔 Please respond", "message": msg, "action_url": "/family"}, idempotency_key=nd["id"])
                except Exception:
                    pass
                if mu and mu.get("phone"):
                    try:
                        await notify_whatsapp(mu["phone"], f"🔔 Nek Sathi: {msg}", meta={"kind": "nudge", "user_id": ci["member_user_id"]})
                    except Exception:
                        pass
        except Exception as e:
            log.warning("checkin nudge scanner: %s", e)
        await asyncio.sleep(30)
