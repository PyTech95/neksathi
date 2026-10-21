from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field


class ContactFormIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=20)
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=5, max_length=2000)


class SupportTicketIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=5, max_length=2000)
    priority: Literal["low", "normal", "high"] = "normal"


class SupportReplyIn(BaseModel):
    reply: str = Field(min_length=1, max_length=2000)
    status: Optional[Literal["open", "in_progress", "resolved", "closed"]] = None


class FAQIn(BaseModel):
    question: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=2000)
    category: Optional[str] = None
    order: int = 0
    active: bool = True


class ContactStatusIn(BaseModel):
    status: Literal["new", "in_progress", "replied", "closed"]
