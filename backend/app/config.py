"""Environment / settings and process-wide logging for the Nek Sathi backend."""
from __future__ import annotations

import logging
import os
from pathlib import Path

import stripe
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ["JWT_ALGORITHM"]
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ["ACCESS_TOKEN_EXPIRE_MINUTES"])

# Payments: Stripe is kept only as a legacy / dry-run path (Razorpay is wired in
# a later milestone). With no real key set, checkout runs in a safe DRY-RUN so the
# journey still works end-to-end for local testing.
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY", "")
STRIPE_DRY_RUN = not STRIPE_API_KEY.startswith(("sk_live_", "sk_test_"))
if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

NEK_PORTAL_NUMBER = os.environ.get("NEK_PORTAL_NUMBER", "+91 80 4718 0000")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("safeqr")
