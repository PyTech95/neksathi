"""MongoDB (Motor) client + database handle."""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient

from app.config import MONGO_URL, DB_NAME

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
