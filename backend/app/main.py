"""Raksha API."""

import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import matching
from app.config import settings
from app.db import pool
from app.routes import auth, donors, geo, requests, webhook

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    pool.open(wait=True)
    scheduler = BackgroundScheduler()
    scheduler.add_job(matching.process_due, "interval", seconds=60, max_instances=1, coalesce=True)
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)
    pool.close()


app = FastAPI(title="Raksha", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_base_url, "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (webhook.router, auth.router, donors.router, requests.router, geo.router):
    app.include_router(r)


@app.get("/health")
def health():
    return {"ok": True}
