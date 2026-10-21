from __future__ import annotations

from datetime import datetime
import base64
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class VehicleIn(BaseModel):
    number_plate: str = Field(min_length=1, max_length=20)
    vehicle_type: Literal["bike", "car", "tractor", "commercial", "other"] = "car"
    make_model: Optional[str] = None
    color: Optional[str] = None
    photo_base64: Optional[str] = None  # data:image/... base64
    speed_limit_kmh: int = Field(default=80, ge=10, le=300)


class VehicleOut(BaseModel):
    id: str
    owner_id: str
    number_plate: str
    vehicle_type: str
    make_model: Optional[str] = None
    color: Optional[str] = None
    photo_base64: Optional[str] = None
    qr_id: str
    speed_limit_kmh: int
    lost_mode: bool
    created_at: datetime
    # commerce: whether a QR sticker was ordered+paid, and the plan state
    qr_ordered: bool = False
    qr_order_id: Optional[str] = None
    plan_status: str = "none"          # none | active | grace | expired
    plan_name: Optional[str] = None
    plan_days_left: int = 0
    plan_expires_at: Optional[datetime] = None


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=20)
    relation: Optional[str] = None
    receives_emergency: bool = True
    receives_speed_alert: bool = True
    receives_parking: bool = True


class ContactOut(ContactIn):
    id: str
    vehicle_id: str


class LocationIn(BaseModel):
    latitude: float
    longitude: float
    speed_kmh: float = 0.0
    heading: Optional[float] = None


class LocationOut(LocationIn):
    id: str
    vehicle_id: str
    recorded_at: datetime


class PublicVehicleOut(BaseModel):
    """Only info shown on public QR scan – NO personal owner data."""
    qr_id: str
    number_plate: str
    vehicle_type: str
    make_model: Optional[str] = None
    color: Optional[str] = None
    photo_base64: Optional[str] = None
    owner_first_name: str  # first name only for humanization


class ScanAlertIn(BaseModel):
    type: Literal["emergency", "wrong_parking", "theft", "fire", "towing", "sos"]
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None


class AlertOut(BaseModel):
    id: str
    vehicle_id: Optional[str] = None
    tag_id: Optional[str] = None
    card_id: Optional[str] = None
    user_id: Optional[str] = None
    number_plate: str
    type: str
    scanner_note: Optional[str] = None
    scanner_phone: Optional[str] = None
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None
    audio_base64: Optional[str] = None
    created_at: datetime
    contact_channels: List[str] = []


class AccidentIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    speed_before_kmh: Optional[float] = None
    impact_g: Optional[float] = None
    resolved: bool = False
    resolution: Optional[Literal["safe", "need_help", "no_response"]] = None


class LostModeIn(BaseModel):
    enabled: bool


class SOSVideoIn(BaseModel):
    video_base64: str = Field(min_length=10)
    duration_ms: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class SOSVideoMeta(BaseModel):
    id: str
    vehicle_id: Optional[str] = None
    duration_ms: int
    size_bytes: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime


class UserSOSVideoIn(BaseModel):
    # Cap base64 body at ~28 MB → ~20 MB decoded video. Keeps Mongo docs sane
    # and stops the endpoint being a DoS vector.
    video_base64: str = Field(min_length=10, max_length=28 * 1024 * 1024)
    duration_ms: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    vehicle_id: Optional[str] = None


CHUNK_MAX_BYTES = 5 * 1024 * 1024          # ~5 MB base64 per chunk


class SOSInitIn(BaseModel):
    total_chunks: int = Field(ge=1, le=2000)
    duration_ms: int = 0
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    vehicle_id: Optional[str] = None


class SOSChunkIn(BaseModel):
    upload_id: str
    index: int = Field(ge=0)
    data_base64: str = Field(min_length=1, max_length=CHUNK_MAX_BYTES + 1024)


class SOSCompleteIn(BaseModel):
    upload_id: str


class InviteCreateOut(BaseModel):
    token: str
    join_url: str
    expires_at: datetime


class PublicInvitePreview(BaseModel):
    vehicle_number_plate: str
    invited_by_name: str
    expires_at: datetime
    already_accepted: bool = False


class SharedVehicleOut(BaseModel):
    id: str
    number_plate: str
    make_model: Optional[str] = None
    vehicle_type: str
    photo_base64: Optional[str] = None
    owner_id: str
    owner_name: Optional[str] = None
    role: str
