from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class BridgeReqIn(BaseModel):
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    entity: Literal["vehicle", "tag", "card"] = "vehicle"


class BridgeOut(BaseModel):
    kind: Literal["msg91", "mock", "unavailable"]
    dial_url: Optional[str] = None
    masked_from: Optional[str] = None
    masked_to: Optional[str] = None
    expires_at: Optional[datetime] = None
    note: Optional[str] = None


class IncidentCreateIn(BaseModel):
    type: Literal["wrong_parking", "vehicle_blocking", "headlight_on", "door_open", "emergency", "vehicle_damage", "other", "accident", "theft"]
    scanner_note: Optional[str] = Field(default=None, max_length=500)
    scanner_phone: Optional[str] = Field(default=None, max_length=20)
    scanner_lat: Optional[float] = None
    scanner_lng: Optional[float] = None
    evidence_photo_base64: Optional[str] = None   # photo of the car/scene (reporter-facing)
    reporter_photo_base64: Optional[str] = None    # silent front-camera selfie of the reporter


class RTCDescriptionIn(BaseModel):
    sdp: dict


class RTCCandidateIn(BaseModel):
    candidate: dict


class IncidentCallIn(BaseModel):
    scanner_phone: Optional[str] = Field(default=None, max_length=20)


class IncidentRespondIn(BaseModel):
    response: Literal["coming", "cant"]
