from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class CommunityPostIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)
    photo_base64: Optional[str] = None
