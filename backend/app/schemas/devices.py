from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    platform: Optional[str] = Field(default=None, max_length=20)
    push_token: Optional[str] = Field(default=None, max_length=400)
    lock_threshold: int = Field(default=3, ge=2, le=5)
    guardian_contact_id: Optional[str] = None
    super_admin_alerts: bool = True


class DeviceOut(BaseModel):
    id: str
    name: str
    platform: Optional[str] = None
    lock_threshold: int = 3
    guardian_contact_id: Optional[str] = None
    super_admin_alerts: bool = True
    locked: bool = False
    siren_active: bool = False
    created_at: datetime
    last_seen: Optional[datetime] = None


class IntruderIn(BaseModel):
    photo_base64: Optional[str] = None
    attempt_count: int = Field(default=1, ge=1, le=50)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class IntruderEventOut(BaseModel):
    id: str
    device_id: str
    device_name: str
    attempt_count: int
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    has_photo: bool = False
    view_token: str
    triggered_lock: bool = False
    created_at: datetime


class SimSwapIn(BaseModel):
    new_number: Optional[str] = Field(default=None, max_length=20)
    carrier: Optional[str] = Field(default=None, max_length=60)
    imsi: Optional[str] = Field(default=None, max_length=40)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class SirenIn(BaseModel):
    active: bool = True
