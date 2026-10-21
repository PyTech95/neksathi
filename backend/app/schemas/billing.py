from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class PlanOut(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None
    price_cents: int
    currency: str
    interval: str  # "month" | "year"
    validity_days: int = 30  # how many days the plan stays active
    vehicle_limit: int
    features: List[str] = []
    active: bool = True
    popular: bool = False


class PlanIn(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=1, max_length=80)
    description: Optional[str] = None
    price_cents: int = Field(ge=0)
    currency: str = "INR"
    interval: str = "year"   # all plans are yearly in Nek Sathi
    validity_days: int = Field(default=365, ge=1, le=3650)
    vehicle_limit: int = Field(default=1, ge=1, le=999)
    features: List[str] = []
    active: bool = True
    popular: bool = False


class CheckoutIn(BaseModel):
    plan_code: str
    return_url: Optional[str] = None


class ConfirmIn(BaseModel):
    session_id: str


class SubscriptionOut(BaseModel):
    id: str
    user_id: str
    plan_code: str
    plan_name: str
    status: str  # "active" | "cancelled" | "past_due" | "pending"
    current_period_end: Optional[datetime] = None
    stripe_session_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    created_at: datetime
