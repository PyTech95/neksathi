from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class EmergencyContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=20)
    relation: Optional[str] = Field(default=None, max_length=40)
    is_primary: bool = False


class EmergencyContactOut(BaseModel):
    id: str
    name: str
    phone: str
    relation: Optional[str] = None
    is_primary: bool = False
    created_at: datetime


class SOSTriggerIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    message: Optional[str] = Field(default=None, max_length=280)
    photo_base64: Optional[str] = None


class SOSEventOut(BaseModel):
    id: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    message: Optional[str] = None
    notified: int = 0
    channels: List[str] = []
    has_photo: bool = False
    acknowledged: bool = False
    escalated: bool = False
    created_at: datetime


class LiveShareStartIn(BaseModel):
    duration_min: int = Field(default=60, ge=5, le=1440)
    label: Optional[str] = Field(default=None, max_length=60)


class LiveShareOut(BaseModel):
    id: str
    token: str
    label: Optional[str] = None
    active: bool = True
    expires_at: datetime
    created_at: datetime


class UserLocationIn(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed_kmh: Optional[float] = None


class AudioEvidenceIn(BaseModel):
    audio_base64: str = Field(min_length=10)
    duration_ms: Optional[int] = None
    mime: Optional[str] = Field(default="audio/webm", max_length=40)
    sos_event_id: Optional[str] = None


class AudioEvidenceOut(BaseModel):
    id: str
    duration_ms: Optional[int] = None
    mime: str = "audio/webm"
    sos_event_id: Optional[str] = None
    created_at: datetime


class SafeZoneIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    latitude: float
    longitude: float
    radius_m: int = Field(default=300, ge=50, le=20000)
    notify: bool = True


class SafeZoneOut(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    radius_m: int
    notify: bool = True
    last_inside: Optional[bool] = None
    created_at: datetime


class GeofenceEventOut(BaseModel):
    id: str
    zone_name: str
    type: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    created_at: datetime


class LinkCheckIn(BaseModel):
    url: str = Field(min_length=4, max_length=2048)
