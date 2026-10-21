# What's new in this build — QR commerce (web)

Full frontend + backend. Verified: backend compiles, **frontend production build
succeeds**, and a **39-check in-process end-to-end test passes** (vehicle + tag
order → pay → sticker download → delivered → plan active, admin tag-plan CRUD,
transactions, recharge). Razorpay runs in **dry-run** with no keys, so you can
test the whole journey locally end-to-end, then add keys to go live.

> Reminder: this backend is base + these features. It does NOT include the VPS
> FCM push patch — keep that in mind before deploying to production.

---

## ⭐⭐⭐ Newest additions (auth & OTP)

Verified with a **29-check in-process end-to-end suite (0 failed)** covering all four below.

### 1) Forgot password — email OTP (not a link)
- Login page now has a **“Forgot password?”** link → `/forgot-password`.
- Flow: enter email → **6-digit code** emailed (valid **5 minutes**) → verify → a **new + confirm password** popup → done → log in.
- **Demo mode** (no SMTP configured): the code shows on screen so you can test instantly. **Live** (your SMTP set): it’s emailed. The code is single-use, with a one-time reset ticket after verify.
- Endpoints: `POST /auth/forgot-password`, `POST /auth/forgot-password/verify`, `POST /auth/reset-password`.

### 2) Admin — OTP / SMS gateway: Demo ↔ Live toggle
- New **Admin → OTP / SMS gateway** (`/admin/otp-settings`): a **Demo ↔ Live** switch.
  - **Demo** → OTP shows on screen (no SMS sent) — great for testing.
  - **Live** → enter your **MSG91 Auth Key + OTP Template ID** → real OTP SMS goes to the mobile. Flips instantly, no restart.
- The toggle genuinely controls delivery: in Demo, codes are on-screen **even if keys are present**. The saved auth key is shown masked; leaving it blank keeps it.
- You can set keys via the panel **or** in `.env` (`MSG91_AUTHKEY`, `MSG91_OTP_TEMPLATE_ID`, `MSG91_SMS_SENDER`) — env takes priority. (India: OTP SMS goes via a DLT-registered gateway like MSG91, not directly from Jio/Vi/Airtel.)

### 3) Mobile number is one canonical key (no duplicate accounts)
- Phone numbers are normalised everywhere (`+91`, spaces, leading 0, bare 10-digit all collapse to one key), so **mobile-OTP login always reconnects to the same account** and its data — never a duplicate empty account. Legacy users are back-filled at startup.

### 4) Verify your mobile number (profile) + gating
- **Settings → Phone** now shows a **Verified / Not verified** badge and a **Verify** button → OTP (demo on-screen / live SMS) → verified. A number can be verified on only one account.
- Signing up stays frictionless; a **“Verify your number”** nudge appears on the dashboard, and **verification is required before ordering a QR** (vehicle or tag). Logging in by mobile OTP auto-verifies the number.

---

## ⭐⭐ Latest additions

### Referral & tokens
- **Profile → Refer & earn** (`/referral`): each user gets a **referral code + share link** (WhatsApp / copy / native share).
- A friend who signs up via the link has the code **auto-applied**; or they can **enter a code manually** in Refer & earn (one code per account, only if never referred, not your own).
- When a referred user makes their **first paid plan purchase**: referrer gets **100 tokens**, referred gets **50 tokens** (one-time; not repeated on later buys). A referrer can refer unlimited people and earns 100 per referred buyer.
- **Tokens = discount**: `10 tokens = ₹1`. At checkout (buy QR / recharge) tick **"Use my tokens"** to knock the rupee value straight off the price; tokens are deducted on payment.
- Endpoints: `GET /me/referral`, `POST /me/referral/apply`, `GET /me/tokens`; token discount via `use_tokens` on order/recharge create.

### Yearly plans only
- Monthly is gone — **all plans are yearly**. Admin sets price + validity (e.g. 365 days) + features. Any legacy monthly plan is auto-migrated to yearly on startup.

### Admin — copy delivery address
- In **QR orders**, each order's **SHIP TO** box now has **Copy** (one-click copy of the full address for the delivery partner) + **Print label**.

### New sticker design wired in
- The approved **red/black/white** sticker is now the backend template — admin Download/Print generates it with each order's **unique QR + unique CODE**.

---

## ⭐ Earlier build (the 3 before)

### A) Admin QR download / print (always re-downloadable)
- From **Admin → QR orders** (`/admin/orders`), once an order reaches **Printed**
  (and for every stage after — shipped, out-for-delivery, delivered), a
  **Download** + **Print** button appears for that order's QR sticker.
- The sticker is the approved **red/black Nek Sathi design** with a **fresh,
  scannable QR** and a **unique 6-digit CODE** (stored on the order, shown in the
  table). Same design for vehicles and tags (tag header says "Safety QR Tag").
- **Not one-time** — download or print any number of times, even after delivery.
- Endpoint: `GET /api/admin/orders/{id}/sticker.png`
- Renderer: `backend/sticker.py` + pre-baked `backend/assets/sticker_template.png`
  (no yellow source / no Devanagari font needed at runtime — see "Sticker fonts").

### B) Tag payment flow (exactly like vehicles)
- Tags no longer "just work": a tag now follows the same journey —
  **Add tag → choose plan (by tag type) → delivery address → pay → delivery
  tracking → plan validity → recharge.**
- Page: `/buy-tag/:tagId` — `src/pages/BuyTagQR.jsx`. Entry: every tag card and
  the tag detail page show **"Order QR"** before paying; **"Manage" + plan pill**
  after. A paid tag **cannot be deleted** (same guard as vehicles).
- Orders & tracking reuse the same `/orders` + `/orders/:id` screens.

### C) Admin tag plans (per-type price + facilities)
- Page: `/admin/tag-plans` — `src/pages/AdminTagPlans.jsx` (card on the Admin home).
- Set a **different price, validity and facilities** for **each tag type**
  (Person, School kid, Patient, Staff, Pet, Bag, Luggage, Keys, Phone, Laptop,
  Door, Other). Customers buying a tag see only the plans for that tag's type.
- Sensible defaults are seeded on first run; admin can edit / add / remove.
- Endpoints: `GET /api/tag-plans?tag_type=`, `GET|POST /api/admin/tag-plans`,
  `PUT|DELETE /api/admin/tag-plans/{id}`.

### Sticker fonts (server note)
The template art is baked in, so the server only needs a font for the small
"CODE: ######" text and the tag header. `sticker.py` tries Liberation → DejaVu →
PIL default. On the VPS, install one of them once: `apt-get install -y
fonts-liberation` (or `fonts-dejavu`). To regenerate the template after a design
tweak: `cd backend/assets && python3 bake_template.py`.

---

## 1) Customer "buy QR" journey (NO free QR anymore)
Flow: **Add vehicle → choose plan → delivery address → pay (Razorpay) → order placed → live delivery tracking.**
- Page: `/buy-qr` (or `/buy-qr/:vehicleId`) — `src/pages/BuyQR.jsx`
- Entry points: every vehicle card on the Dashboard now has **"Order QR / Plan"**, plus **My Orders** page.
- On payment success the order starts at **QR generating** and the QR is tied to the vehicle.

## 2) Delivery tracking (Amazon-style)
- Pages: `/orders` (list) + `/orders/:id` (tracker) — `Orders.jsx`, `OrderDetail.jsx`
- Stages: generating → printed → shipped → out for delivery → delivered.
- **On "Delivered" the plan activates** (validity clock starts).

## 3) Plans with validity + recharge
- Admin sets price + **validity (days)** per plan (`/admin/plans`).
- Each QR/vehicle carries its own plan with `expires_at`.
- Status: **active → (expires) → 3-day grace → expired**.
- **Recharge** from the order page → Razorpay → validity extends (auto-renew on paid).

## 4) Admin — orders & delivery & Razorpay
- Page: `/admin/orders` — `AdminOrders.jsx`
- Advance each order through delivery stages (one click).
- **Razorpay settings** here: enter Key ID / Secret / Webhook secret (or keep them in server `.env`). Shows LIVE vs TEST(dry-run) badge.

## 5) Vendor "scan & assign" + OTP (offline)
- Page: `/dealer/assign` — `DealerAssign.jsx` (button on the Dealer dashboard)
- Dealer enters serial + **customer mobile** + vehicle + plan → **OTP to the customer** → verify → QR registered to the **customer's** account + plan activated.
- Dealer can only assign their own stock. In TEST mode the OTP is shown on screen.
- Customer later logs in with that mobile (OTP) to see their plan/QR.

## 6) Admin — per-vendor dashboard
- Page: `/admin/dealers/:id` — `AdminVendorView.jsx` (click a dealer's name)
- Shows QR given / remaining / activated / blocked, customers, active / expired / pending-OTP, and each customer's plan + validity.

---

## New backend (one module: `backend/neksathi_commerce.py`, wired into server.py)
Payments: `GET /payments/config`, `POST /orders/create`, `POST /tag-orders/create`, `POST /orders/verify`, `POST /payments/webhook`
Orders: `GET /me/orders`, `GET /me/orders/{id}`, `GET /me/vehicles/plans`, `GET /me/transactions`
Recharge: `POST /me/recharge/create`, `POST /me/recharge/verify` (vehicle **and** tag)
Tag plans: `GET /tag-plans`, `GET|POST /admin/tag-plans`, `PUT|DELETE /admin/tag-plans/{id}`
Admin: `GET /admin/orders` (vehicles + tags), `POST /admin/orders/{id}/advance`, `GET /admin/orders/{id}/sticker.png`, `GET|POST /admin/integrations/razorpay`, `GET /admin/vendors/{id}/dashboard`
Vendor: `POST /dealer/assign/start`, `POST /dealer/assign/verify`
Models: Plan gained `validity_days`; Tag gained `qr_ordered` + plan fields; orders carry `product_type` (vehicle|tag) + `sticker_code`.

---

## Testing locally (no keys needed)
1. Run backend + frontend (see `LOCAL_RUN.md`).
2. Admin → Plans → create e.g. Basic ₹99 / 30 days.
3. Dashboard → a vehicle → **Order QR / Plan** → pick plan → address → **Pay** (dry-run completes instantly) → **Track my order**.
4. Admin → QR orders → advance to **Printed** → a **Download / Print QR** button appears (re-download any time) → keep advancing to **Delivered** → the plan activates.
5. **Tags:** Admin → Tag plans → check/edit per-type prices. User → Tags → a tag → **Order QR** → pick a plan → address → **Pay** → Track. Admin → QR orders → that tag order shows **Download / Print** from Printed onward. Deliver → tag plan activates; the tag can't be deleted once paid.
6. Vendor flow: Admin → Dealers → add a dealer → Create login. Admin → Car QR → generate a batch (so a serial exists) and mark it sold to that dealer. Log in as the dealer → **Scan & assign** → enter serial + a mobile + plan → the on-screen TEST OTP → verify.
7. Admin → Dealers → click the dealer name → per-vendor dashboard.

## Going live with Razorpay
- Put real keys in `backend/.env` (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, optional `RAZORPAY_WEBHOOK_SECRET`) **or** Admin → QR orders → Razorpay.
- `pip install razorpay` on the server (only needed for live mode).
- Point a Razorpay webhook at `https://<your-api>/api/payments/webhook`.

## Not yet (next)
- Enforcing "expired QR goes silent on scan→call" is a small hook to add when the
  FCM call code is merged (kept out now to avoid clashing with your VPS patch).
- DB indexes / larger pagination polish (scale pass).
