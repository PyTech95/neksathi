# NEK SATHI — run the full web app LOCALLY (clean, no vendor lock-in)

This is the COMPLETE project (frontend + backend). **All Emergent dependencies
have been removed** — push, email, the Stripe placeholder, the `litellm`
Emergent wheel, the craco "visual-edits" plugin, and every `emergentagent.com`
URL. Nothing external is required to boot: email/SMS/push/payments are all
optional and self-hosted.

> ⚠️ Backend note: this is the BASE code + Milestone-1 (plans validity). It does
> NOT include the FCM push patch that is live on your VPS. For LOCAL testing
> that's fine (calls work via polling; OS push can't be tested in a browser).
> Don't blind-overwrite your production backend with this — tell me when you're
> ready to deploy and I'll give the FCM step.

---

## 0) Prerequisites
- Python 3.11+
- Node.js 18+ and npm
- MongoDB — local (`mongodb://127.0.0.1:27017`) or a free MongoDB Atlas URL

---

## 1) Backend (FastAPI)
```bash
cd backend
python -m venv venv
# Windows:   venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env         # then edit .env  (Windows: copy .env.example .env)
```
Minimum `.env` to boot (full template is in `backend/.env.example`):
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
Run:
```bash
uvicorn server:app --reload --port 8006
```
Check: open http://127.0.0.1:8006/api/plans  → should return `[]` (or your plans).

> Email / SMS / WhatsApp / OTP / push / payments are OPTIONAL. Leave them blank
> and those features simply stay off — the app runs fine. For password-reset
> email in dev, the reset token is returned in the API response (no SMTP needed).

---

## 2) Frontend (React)
```bash
cd frontend
npm install
cp .env.example .env          # then edit  (Windows: copy .env.example .env)
```
`frontend/.env`:
```
REACT_APP_BACKEND_URL=http://127.0.0.1:8006
REACT_APP_PUBLIC_WEB_URL=http://localhost:3000
GENERATE_SOURCEMAP=false
```
Run:
```bash
npm start
```
Web opens at http://localhost:3000

---

## 3) Smoke test (Milestone-1 plans)
1. Log in with ADMIN_EMAIL / ADMIN_PASSWORD.
2. Admin → Plans → New plan → Basic / 99 / Validity 30 → "₹99 · 30 days".
3. Add another: Standard / 299 / 120 days.

Tell me "LOCAL OK" → I build Milestone 2 (Razorpay + user order / delivery
tracking) on this exact codebase.

---

## Not included on purpose (recreated locally)
- frontend/node_modules  → `npm install`
- frontend/build         → `npm run build`
- backend/venv           → created in step 1
