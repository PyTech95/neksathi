from __future__ import annotations

from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=6, max_length=20)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class NotifyPrefs(BaseModel):
    whatsapp: bool = True
    email: bool = True
    push: bool = True
    incident_alerts: bool = True
    speed_alerts: bool = True
    marketing: bool = False
    ringtone: str = "classic"


class UserOut(BaseModel):
    id: str
    email: Optional[EmailStr] = None
    name: str
    email_verified: bool = False
    phone: str
    phone_verified: bool = False
    is_admin: bool = False
    is_dealer: bool = False
    vendor_id: Optional[str] = None
    is_org: bool = False
    org_id: Optional[str] = None
    suspended: bool = False
    notify_prefs: NotifyPrefs = NotifyPrefs()
    avatar_base64: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    # True only when this OTP login just created the account, so the app can
    # take a brand-new user to their Profile page to fill name / email.
    is_new: bool = False


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=80)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, min_length=6, max_length=20)
    notify_prefs: Optional[NotifyPrefs] = None
    avatar_base64: Optional[str] = Field(default=None, max_length=1_500_000)


class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=72)


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ForgotVerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)


class ResetPasswordIn(BaseModel):
    token: str  # the one-time reset_ticket returned by /auth/forgot-password/verify
    new_password: str = Field(min_length=6, max_length=72)


class AccountDeleteIn(BaseModel):
    password: str = Field(min_length=6)
    confirm: Literal["DELETE"] = "DELETE"


class TelcoConfigIn(BaseModel):
    provider: Literal["msg91", "mock"] = "msg91"
    sms_enabled: bool = False
    msg91_authkey: Optional[str] = Field(default=None, max_length=120)
    msg91_otp_template_id: Optional[str] = Field(default=None, max_length=80)
    msg91_sms_flow_id: Optional[str] = Field(default=None, max_length=80)
    msg91_sms_sender: Optional[str] = Field(default=None, max_length=20)
    msg91_whatsapp_number: Optional[str] = Field(default=None, max_length=20)
    msg91_whatsapp_template: Optional[str] = Field(default=None, max_length=120)
    msg91_whatsapp_namespace: Optional[str] = Field(default=None, max_length=120)
    msg91_caller_id: Optional[str] = Field(default=None, max_length=20)


class OtpRequestIn(BaseModel):
    phone: str = Field(min_length=6, max_length=20)


class OtpVerifyIn(BaseModel):
    phone: str = Field(min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=8)
    name: Optional[str] = Field(default=None, max_length=80)


class PhoneOtpRequestIn(BaseModel):
    phone: Optional[str] = Field(default=None, min_length=6, max_length=20)


class PhoneOtpConfirmIn(BaseModel):
    phone: Optional[str] = Field(default=None, min_length=6, max_length=20)
    code: str = Field(min_length=4, max_length=8)


class EmailOtpRequestIn(BaseModel):
    email: EmailStr


class EmailOtpConfirmIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=8)
