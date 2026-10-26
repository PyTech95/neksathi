from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class FamilyCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


class FamilyJoinIn(BaseModel):
    invite_code: str = Field(min_length=4, max_length=12)


class FamilyAddByPhoneIn(BaseModel):
    phone: str = Field(min_length=4, max_length=20)
    name: Optional[str] = Field(default=None, max_length=60)


class SharingIn(BaseModel):
    share_location: bool = True
    share_activity: bool = True


class ActivityIn(BaseModel):
    type: str = Field(pattern="^(app_usage|screen_time|checkin|battery|app_install)$")
    app_name: Optional[str] = Field(default=None, max_length=80)
    seconds: Optional[int] = Field(default=None, ge=0)
    note: Optional[str] = Field(default=None, max_length=200)
    battery: Optional[int] = Field(default=None, ge=0, le=100)


class StatusIn(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    battery: Optional[int] = Field(default=None, ge=0, le=100)


class AlertRulesIn(BaseModel):
    place_alerts_enabled: bool = True
    place_alert_direction: Literal["both", "enter", "exit"] = "both"
    quiet_start: Optional[int] = Field(default=None, ge=0, le=23)
    quiet_end: Optional[int] = Field(default=None, ge=0, le=23)
    low_battery_threshold: int = Field(default=15, ge=5, le=50)
    sos_escalation_min: int = Field(default=3, ge=1, le=15)
    digest_day: int = Field(default=6, ge=0, le=6)
    digest_hour: int = Field(default=9, ge=0, le=23)


class ZoneMuteIn(BaseModel):
    muted: bool


class CheckInIn(BaseModel):
    member_id: str


class CheckInRespondIn(BaseModel):
    status: Literal["safe", "need_help"]


class NudgeIn(BaseModel):
    member_id: str


class TempCircleIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    hours: int = Field(default=6, ge=1, le=24)


class TempJoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)


class CirclePingIn(BaseModel):
    latitude: float
    longitude: float
