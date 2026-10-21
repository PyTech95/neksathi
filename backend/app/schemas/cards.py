from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class CardIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=80)
    title: Optional[str] = Field(default=None, max_length=80)
    company: Optional[str] = Field(default=None, max_length=80)
    bio: Optional[str] = Field(default=None, max_length=280)
    phone: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    website: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=200)
    photo_base64: Optional[str] = None
    accent: Optional[Literal["neon", "sunset", "ocean", "forest"]] = "neon"
    socials: dict = Field(default_factory=dict)  # {twitter, linkedin, instagram, github, whatsapp, ...}


class CardOut(CardIn):
    id: str
    owner_id: str
    qr_id: str
    created_at: datetime


class CardMessageIn(BaseModel):
    from_name: str = Field(min_length=1, max_length=80)
    from_phone: Optional[str] = Field(default=None, max_length=20)
    from_email: Optional[str] = Field(default=None, max_length=120)
    body: str = Field(min_length=1, max_length=1000)
