from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field


class DriveEvidenceIn(BaseModel):
    filename: str = Field(min_length=1, max_length=120)
    mime_type: str = Field(min_length=3, max_length=60)
    data_base64: str = Field(min_length=8)


class GDriveConfigIn(BaseModel):
    client_id: str = Field(default="", max_length=200)
    client_secret: Optional[str] = Field(default=None, max_length=200)
    redirect_uri: str = Field(default="", max_length=300)
    frontend_url: str = Field(default="", max_length=200)


class BlackspotIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Literal["accident", "crime", "flood", "landslide", "other"] = "accident"
    severity: Literal["low", "medium", "high"] = "medium"
    lat: float
    lng: float
    radius_m: int = Field(default=250, ge=50, le=5000)
    notes: Optional[str] = Field(default=None, max_length=280)


class BlackspotOut(BlackspotIn):
    id: str
    created_at: datetime


class BulkGenerateIn(BaseModel):
    count: int = Field(ge=1, le=10000)
    batch_label: Optional[str] = None
    notes: Optional[str] = None
    product_type: Optional[Literal["vehicle", "tag", "card"]] = None
    product_subtype: Optional[str] = Field(default=None, max_length=60)  # e.g. "car", "pet", "mobile"
    org_name: Optional[str] = Field(default=None, max_length=120)
    org_id: Optional[str] = None


class ClaimIn(BaseModel):
    serial_no: str
    product_type: Literal["vehicle", "tag", "card"]
    payload: dict


class AssignDealerIn(BaseModel):
    """Assign QR codes to a dealer/vendor by id (sets sold_vendor_id so the
    dealer-assign flow recognises its own stock). Pass a batch_id OR a serial range."""
    vendor_id: str
    batch_id: Optional[str] = None
    serial_from: Optional[str] = None
    serial_to: Optional[str] = None


class VendorIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    gstin: Optional[str] = None
    notes: Optional[str] = None


class VendorOrderIn(BaseModel):
    batch_id: Optional[str] = None  # optional link to a QR batch
    serial_from: Optional[str] = None
    serial_to: Optional[str] = None
    qty: int = Field(ge=1, le=10000)
    unit_price_paise: int = Field(ge=0)
    notes: Optional[str] = None
    mark_batch_sold: bool = False  # auto-mark serials as sold to this vendor


class VendorPaymentIn(BaseModel):
    amount_paise: int = Field(ge=1)
    method: Literal["cash", "upi", "bank", "cheque", "other"] = "cash"
    reference: Optional[str] = None
    notes: Optional[str] = None


class DealerAccountIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = Field(default=None, max_length=80)


class OrgIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    org_type: Literal["school", "hospital", "office", "other"] = "school"
    city: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=20)


class OrgAccountIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = Field(default=None, max_length=80)
