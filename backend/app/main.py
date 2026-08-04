from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .database import init_db, list_alerts, resolve_alert
from .health import current_health
from .video_processor import ProcessorManager

manager = ProcessorManager()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    manager.start()
    yield
    manager.stop()


app = FastAPI(
    title="GDRFA AI Shelter Backend",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AlertUpdate(BaseModel):
    status: str
    officer_note: str = ""


@app.get("/api/health")
def api_health() -> dict:
    return {"status": "ok", "service": "GDRFA AI Shelter Backend"}


@app.get("/api/cameras")
def cameras() -> list[dict]:
    return manager.states()


async def mjpeg_generator(camera_id: str) -> AsyncGenerator[bytes, None]:
    processor = manager.get(camera_id)
    if processor is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    while True:
        frame = processor.state.latest_jpeg
        if frame is not None:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n"
        await asyncio.sleep(0.04)


@app.get("/api/cameras/{camera_id}/stream")
def camera_stream(camera_id: str) -> StreamingResponse:
    if manager.get(camera_id) is None:
        raise HTTPException(status_code=404, detail="Camera not found")
    return StreamingResponse(
        mjpeg_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@app.get("/api/alerts")
def alerts(limit: int = 50) -> list[dict]:
    return list_alerts(limit=max(1, min(limit, 200)))


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: int, payload: AlertUpdate) -> dict:
    allowed = {"Open", "Verified", "False Alert", "Escalated", "Resolved"}
    if payload.status not in allowed:
        raise HTTPException(status_code=400, detail=f"Status must be one of {sorted(allowed)}")
    if not resolve_alert(alert_id, payload.status, payload.officer_note):
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"updated": True}


@app.get("/api/residents/health")
def resident_health() -> list[dict]:
    return current_health()


@app.get("/api/overview")
def overview() -> dict:
    cameras_data = manager.states()
    alerts_data = list_alerts(100)
    return {
        "occupancy": sum(camera["people"] for camera in cameras_data),
        "capacity": sum(camera["capacity"] for camera in cameras_data),
        "active_cameras": sum(1 for camera in cameras_data if "Live" in camera["status"]),
        "open_alerts": sum(1 for alert in alerts_data if alert["status"] == "Open"),
        "critical_alerts": sum(
            1 for alert in alerts_data if alert["status"] == "Open" and alert["severity"] == "Critical"
        ),
        "model": cameras_data[0]["model"] if cameras_data else "Unknown",
    }
