# Nek Sathi — Web Platform Overview (for Client)

**Live website:** https://qrscan-preview-1.preview.emergentagent.com
**Prepared:** June 2026

Nek Sathi is an all-in-one personal safety & mobile-security platform. This document explains
what the website does, how a visitor moves through it, and every feature that is complete and
working — with a direct link to each screen.

> **Login access for review**
> - **Try user account:** `demo_web@safeqr.com` / `demo1234`
> - **Admin account:** `admin@safeqr.com` / `admin1234`
> - **Login page:** https://qrscan-preview-1.preview.emergentagent.com/login

---

## 1. The visitor journey (website flow)

```
Landing page  →  Choose "what to protect"  →  Sign up / Login  →  Personal dashboard
     │                                                                     │
     ├── Try a live QR scan demo (no login)                                ├── One-Tap SOS
     ├── See plans & pricing                                               ├── Family Guardian (live map)
     └── Contact / enquiry form                                            ├── Anti-theft & Safe Zones
                                                                           ├── Temporary Circles
                                                                           └── Smart QR tags & cards
```

1. A visitor lands on the **home page**, sees the value ("Total safety, one tap away") and a
   live SOS demo animation.
2. They pick **what they want to protect** (Myself / My family / My kids / My phone / vehicle, etc.).
3. They **sign up** (email or mobile) and arrive at their **personal dashboard**.
4. From there every safety tool is one click away.

---

## 2. Public pages (no login needed)

| Feature | What it does | Link |
|---|---|---|
| **Home / Landing** | Full marketing page: hero, feature pillars, "what to protect", how-it-works, plans teaser, FAQ | https://qrscan-preview-1.preview.emergentagent.com/ |
| **Persona pages** | Tailored pages for each audience (e.g. families, kids, phone) | https://qrscan-preview-1.preview.emergentagent.com/for/family |
| **Live QR Scan demo** | Anyone scanning a Nek Sathi QR can raise an alert to the owner — owner's phone number stays private | https://qrscan-preview-1.preview.emergentagent.com/scan/45805f3a-f10a-4534-bc7d-29699029b2cf |
| **Plans & pricing** | Free / Guardian / Super Family tiers | https://qrscan-preview-1.preview.emergentagent.com/#plans |
| **Contact / Enquiry** | Lead-capture form that lands in the admin inbox | https://qrscan-preview-1.preview.emergentagent.com/contact |
| **Sign up** | Create an account | https://qrscan-preview-1.preview.emergentagent.com/register |
| **Login (email)** | Email + password sign-in | https://qrscan-preview-1.preview.emergentagent.com/login |
| **Login (mobile OTP)** | Mobile OTP sign-in over WhatsApp | https://qrscan-preview-1.preview.emergentagent.com/otp-login |

---

## 3. Personal Safety suite (after login)

| Feature | What it does | Link |
|---|---|---|
| **Dashboard** | Home base — quick access to every tool + status | https://qrscan-preview-1.preview.emergentagent.com/dashboard |
| **One-Tap SOS & Siren** | Panic button that alerts guardians, shares live location, and can sound a loud siren. Auto-escalates (rings a guardian) if not acknowledged | https://qrscan-preview-1.preview.emergentagent.com/safety |
| **Emergency Contacts** | Add trusted guardians who receive your alerts | https://qrscan-preview-1.preview.emergentagent.com/safety |
| **Live Location Sharing** | Share a real-time location link with anyone | https://qrscan-preview-1.preview.emergentagent.com/safety |
| **Alerts feed** | Every alert raised, with map link and time | https://qrscan-preview-1.preview.emergentagent.com/alerts |
| **Incidents** | Full incident history and status | https://qrscan-preview-1.preview.emergentagent.com/incidents |

---

## 4. Family Guardian (after login)

| Feature | What it does | Link |
|---|---|---|
| **Family map & monitoring** | Live map of family members with battery level, activity and alerts | https://qrscan-preview-1.preview.emergentagent.com/family |
| **Place / Zone alerts** | Get notified when kids/elders arrive at or leave a place; alert history & rules | https://qrscan-preview-1.preview.emergentagent.com/safe-zones |
| **Low-battery & check-in alerts** | Nudge a family member to check in; low-battery watch | https://qrscan-preview-1.preview.emergentagent.com/family |
| **Temporary Circles** | Share live location with a group **just for a trip or night out** — auto-expires in 1–24h, no long-term tracking | https://qrscan-preview-1.preview.emergentagent.com/circles |
| **Weekly Safety Digest** | Automatic weekly summary of family safety activity | https://qrscan-preview-1.preview.emergentagent.com/family |

---

## 5. Anti-Theft & Mobile Security (after login)

| Feature | What it does | Link |
|---|---|---|
| **Theft Protection portal** | Central console for device protection & recovery | https://qrscan-preview-1.preview.emergentagent.com/theft-protection |
| **Stolen Phone mode** | Mark a phone stolen, trigger remote siren, track & recover | https://qrscan-preview-1.preview.emergentagent.com/stolen-phone |
| **Intruder Selfie & Device Lock** | Captures a photo of anyone tampering with the phone and can lock the device (executed by the mobile app; the web portal is the command centre) | https://qrscan-preview-1.preview.emergentagent.com/theft-protection |
| **SIM-change alerts** | Get alerted if the SIM is swapped | https://qrscan-preview-1.preview.emergentagent.com/theft-protection |
| **Community safety** | Crowd-sourced local safety feed | https://qrscan-preview-1.preview.emergentagent.com/community |

---

## 6. Smart QR — Vehicles, Tags & Cards (after login)

| Feature | What it does | Link |
|---|---|---|
| **Vehicles** | Register vehicles, generate a scannable QR sticker; strangers can alert you (wrong parking, accident, theft) without seeing your number | https://qrscan-preview-1.preview.emergentagent.com/dashboard |
| **Safety Tags** | QR tags for bags, luggage, pets, kids | https://qrscan-preview-1.preview.emergentagent.com/tags |
| **Digital Safety Cards** | Shareable digital ICE / contact cards | https://qrscan-preview-1.preview.emergentagent.com/cards |
| **Masked calling** | A stranger can call you through a masked number — your real number is never exposed | (inside the public scan flow) |

---

## 7. Account & Billing (after login)

| Feature | What it does | Link |
|---|---|---|
| **Settings & Profile** | Edit name, phone, avatar, notification preferences, change password | https://qrscan-preview-1.preview.emergentagent.com/settings |
| **Subscription / Plans** | View and choose a plan (Stripe payments) | https://qrscan-preview-1.preview.emergentagent.com/subscription |
| **Support tickets** | Raise a ticket and see replies | https://qrscan-preview-1.preview.emergentagent.com/support |

---

## 8. Admin console (admin login only)

Login as admin, then open: https://qrscan-preview-1.preview.emergentagent.com/admin

| Section | What it does |
|---|---|
| **Dashboard & stats** | Users, incidents, live counts |
| **Users** | Search, suspend / reactivate users |
| **QR management** | Generate & manage QR serials |
| **Incidents** | Review all incidents across users |
| **Plans editor** | Create / edit / archive subscription plans |
| **Support inbox** | Reply to and resolve support tickets |
| **Contact enquiries** | Manage leads from the contact form |
| **Dealers / Organisations** | Manage dealer & org accounts |
| **Communications** | Configure/monitor WhatsApp, SMS, call channels |
| **Integrations** | Manage third-party keys & connections |
| **Intruder captures** | Review intruder-selfie captures |
| **Calls log** | Masked-call activity |

---

## 9. Integrations — status

| Integration | Purpose | Status |
|---|---|---|
| **MSG91 WhatsApp** | OTP & safety alerts over WhatsApp | Connected. **Note:** currently using a WhatsApp *test* number, so live delivery reaches only allow-listed phones. Needs a verified business WhatsApp number for all users (dashboard step, no code change). |
| **Vobiz** | Masked voice calling (privacy) | Active |
| **Stripe** | Subscription payments | Configured (test mode) |
| **Google Drive** | Backup | Available (admin-configured) |
| **VirusTotal** | Safe-link / file malware scanning | Built; activates once an API key is added |

---

## 10. What's next (roadmap — not yet built)

- Smart Commute 2.0 (speed/driving-behaviour monitoring, ETA & no-show alerts)
- Digital Scam & Voice Verification (safe-word vault, verify-call)
- Safety Check Timers (auto-escalate if you don't check in)
- Fake Call toolkit
- Offline / low-network SOS failsafes
- Native mobile-app features: crash detection, duress PIN, wearable SOS (require the companion mobile app)

---

*This web platform is the command centre and public/QR layer. Hardware-level actions
(silent intruder photos, lock-screen intercepts) are performed by the companion mobile app,
which talks to this same backend.*
