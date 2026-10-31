"""Send the Raksha welcome template (one-tap login buttons) to phone numbers.

Usage: python scripts/send_welcome.py [919876543210 ...]   (defaults to TEST_PHONES in .env)
"""

import sys

sys.path.insert(0, ".")
from app import whatsapp  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import pool  # noqa: E402
from app.security import normalize_phone  # noqa: E402

phones = [normalize_phone(p) for p in (sys.argv[1:] or settings.test_phones.split(",")) if p.strip()]
pool.open()
for phone in phones:
    print(phone, "accepted by Meta" if whatsapp.send_welcome(phone) else "FAILED (see log above)")
pool.close()
