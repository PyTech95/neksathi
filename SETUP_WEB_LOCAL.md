# Nek Sathi — WEB setup (local check → GitHub → server)

This ZIP is the **web** build: **full backend (FastAPI) + web frontend (React)**.
The mobile-app (Android/iOS) project is **not** included — you'll get that
separately. The same backend API powers both web and the app later.

## Prerequisites
- Python 3.11+ · Node.js 18+ & npm · MongoDB (local `mongodb://127.0.0.1:27017` or a free Atlas URL)

---

## 1) Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Windows: venv\Scripts\activate   |   Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env     # Mac/Linux: cp .env.example .env   (then edit .env)
uvicorn server:app --reload --port 8006
```
Minimum `.env` to boot (full template in `backend/.env.example`):
```
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=neksathi
JWT_SECRET=any-long-random-string
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
ADMIN_EMAIL=admin@neksathi.in
ADMIN_PASSWORD=Admin@12345
PUBLIC_APP_URL=http://127.0.0.1:8006
FRONTEND_URL=http://localhost:3000
```
Check: open http://127.0.0.1:8006/api/plans → returns your plans (seeded yearly plans).

## 2) Frontend (React web)
```bash
cd frontend
npm install
npm start           # .env already points to http://127.0.0.1:8006
```
Opens at http://localhost:3000 · log in with ADMIN_EMAIL / ADMIN_PASSWORD.

---

## Quick things to try (everything works in test mode — no keys needed)
- **Admin → Plans** (yearly only) · **Admin → Tag plans** (per-type price + facilities)
- **Dashboard → a vehicle → Order QR** → pick plan → address → **Pay** (dry-run completes instantly) → **Track order**
- **Admin → QR orders** → advance to **Printed** → **Download / Print QR** (unique QR + unique CODE) · **Copy** / **Print label** for the address
- **Tags** → Order QR (tag flow, same as vehicle)
- **Refer & earn** (Settings → Refer & earn): copy code / share link; apply a friend's code; on first plan buy referrer gets 100 tokens, friend 50; tick **Use my tokens** at checkout for ₹ off (10 tokens = ₹1)
- **Forgot password** (Login → "Forgot password?"): enter email → 6-digit code (shown on screen in demo, emailed when SMTP is set) → verify → set new + confirm password
- **Verify mobile** (Settings → Phone → **Verify**): OTP shows on screen in demo; verification is required before ordering a QR, and keeps mobile-OTP login tied to your account
- **Admin → OTP / SMS gateway** (`/admin/otp-settings`): flip **Demo ↔ Live**. Demo = OTP on screen; Live = paste your MSG91 Auth Key + OTP Template ID (or set them in `.env`) → real OTP SMS

## Going live (on your server)
1. Backend: real `MONGO_URL`, a strong `JWT_SECRET`, set `PUBLIC_APP_URL` / `FRONTEND_URL` to your domains.
2. Razorpay: **Admin → QR orders → Razorpay** → enter Key ID + Secret (or put `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in backend `.env`). `pip install -r requirements.txt` already includes `razorpay`.
3. Frontend: set `frontend/.env` → `REACT_APP_BACKEND_URL=https://api.yourdomain`, `REACT_APP_PUBLIC_WEB_URL=https://yourdomain` → `npm run build` → serve the `build/` folder (Nginx/host).

> No Emergent / no vendor lock-in anywhere. Email / SMS / WhatsApp / push / payments are all optional and self-hosted — leave blank to keep them off.
