from __future__ import annotations

from datetime import datetime
import base64
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class TagIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    tag_type: Literal["person", "kid", "patient", "staff", "pet", "bag", "luggage", "keys", "phone", "laptop", "door", "other"] = "bag"
    description: Optional[str] = Field(default=None, max_length=280)
    photo_base64: Optional[str] = None
    # Optional med / owner hints shown on public scan for kids / people.
    blood_group: Optional[str] = Field(default=None, max_length=12)
    medical_notes: Optional[str] = Field(default=None, max_length=280)
    reward_text: Optional[str] = Field(default=None, max_length=140)
    # Emergency guardian / next-of-kin contact (privacy-safe masked call).
    guardian_name: Optional[str] = Field(default=None, max_length=80)
    guardian_phone: Optional[str] = Field(default=None, max_length=20)


class TagOut(BaseModel):
    id: str
    owner_id: str
    name: str
    tag_type: str
    description: Optional[str] = None
    photo_base64: Optional[str] = None
    blood_group: Optional[str] = None
    medical_notes: Optional[str] = None
    reward_text: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    qr_id: str
    lost_mode: bool
    created_at: datetime
    # commerce: whether a QR sticker was ordered+paid, and the plan state
    qr_ordered: bool = False
    qr_order_id: Optional[str] = None
    plan_status: str = "none"          # none | active | grace | expired
    plan_name: Optional[str] = None
    plan_days_left: int = 0
    plan_expires_at: Optional[datetime] = None


class PublicTagOut(BaseModel):
    qr_id: str
    name: str
    tag_type: str
    description: Optional[str] = None
    photo_base64: Optional[str] = None
    blood_group: Optional[str] = None
    medical_notes: Optional[str] = None
    reward_text: Optional[str] = None
    guardian_name: Optional[str] = None
    has_guardian: bool = False
    lost_mode: bool
    owner_first_name: str


class TagAlertIn(BaseModel):
    type: Literal["found", "emergency", "theft", "damage", "contact", "doorbell", "sos", "kid_help"] = "found"
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None
    # Optional short voice/audio recording from the scanner (e.g. doorbell
    # message, child helper voice note). Cap at ~5 MB base64.
    audio_base64: Optional[str] = Field(default=None, max_length=5 * 1024 * 1024)


class TagCallIn(BaseModel):
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
