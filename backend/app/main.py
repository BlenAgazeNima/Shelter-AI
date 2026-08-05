from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .database import (
    begin_review,
    dismiss_alert,
    get_alert,
    init_db,
    list_alerts,
    list_incidents,
    resolve_alert,
    resolve_incident,
    verify_alert,
)
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
    version="2.0.0",
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


class ReviewRequest(BaseModel):
    officer: str = Field(min_length=1, max_length=100)


class VerifyRequest(BaseModel):
    officer: str = Field(min_length=1, max_length=100)
    category: str = Field(min_length=1, max_length=100)
    action_taken: str = Field(default="", max_length=500)
    note: str = Field(default="", max_length=2000)


class DismissRequest(BaseModel):
    officer: str = Field(min_length=1, max_length=100)
    reason: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=2000)


class ResolveIncidentRequest(BaseModel):
    officer: str = Field(min_length=1, max_length=100)
    resolution_note: str = Field(default="", max_length=2000)


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
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n"
                + frame
                + b"\r\n"
            )

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


@app.get("/api/alerts/{alert_id}")
def alert_details(alert_id: int) -> dict:
    alert = get_alert(alert_id)

    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    return alert


@app.post("/api/alerts/{alert_id}/review")
def review_alert(alert_id: int, payload: ReviewRequest) -> dict:
    alert = get_alert(alert_id)

    if alert is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert["status"] == "Open":
        begin_review(alert_id, payload.officer)

    return {"updated": True, "status": "Under Review"}


@app.post("/api/alerts/{alert_id}/verify")
def verify_alert_endpoint(alert_id: int, payload: VerifyRequest) -> dict:
    incident_id = verify_alert(
        alert_id=alert_id,
        officer=payload.officer,
        category=payload.category,
        action_taken=payload.action_taken,
        note=payload.note,
    )

    if incident_id is None:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {
        "updated": True,
        "alert_status": "Verified",
        "incident_id": incident_id,
    }


@app.post("/api/alerts/{alert_id}/dismiss")
def dismiss_alert_endpoint(alert_id: int, payload: DismissRequest) -> dict:
    if not dismiss_alert(
        alert_id=alert_id,
        officer=payload.officer,
        reason=payload.reason,
        note=payload.note,
    ):
        raise HTTPException(status_code=404, detail="Alert not found")

    return {
        "updated": True,
        "alert_status": "Dismissed",
        "removed_from_active_queue": True,
    }


@app.patch("/api/alerts/{alert_id}")
def update_alert(alert_id: int, payload: AlertUpdate) -> dict:
    allowed = {
        "Open",
        "Under Review",
        "Verified",
        "Dismissed",
        "Escalated",
        "Resolved",
    }

    if payload.status not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of {sorted(allowed)}",
        )

    if not resolve_alert(alert_id, payload.status, payload.officer_note):
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"updated": True}


@app.get("/api/incidents")
def incidents(limit: int = 100) -> list[dict]:
    return list_incidents(limit=max(1, min(limit, 200)))


@app.post("/api/incidents/{incident_id}/resolve")
def resolve_incident_endpoint(
    incident_id: int,
    payload: ResolveIncidentRequest,
) -> dict:
    if not resolve_incident(
        incident_id,
        payload.officer,
        payload.resolution_note,
    ):
        raise HTTPException(status_code=404, detail="Incident not found")

    return {"updated": True, "status": "Resolved"}


@app.get("/api/residents/health")
def resident_health() -> list[dict]:
    return current_health()


@app.get("/api/overview")
def overview() -> dict:
    cameras_data = manager.states()
    alerts_data = list_alerts(200)
    incidents_data = list_incidents(200)

    active_alerts = [
        alert
        for alert in alerts_data
        if alert["status"] in {"Open", "Under Review"}
    ]

    return {
        "occupancy": sum(camera["people"] for camera in cameras_data),
        "capacity": sum(camera["capacity"] for camera in cameras_data),
        "active_cameras": sum(
            1 for camera in cameras_data if "Live" in camera["status"]
        ),
        "open_alerts": len(active_alerts),
        "critical_alerts": sum(
            1
            for alert in active_alerts
            if alert["severity"] == "Critical"
        ),
        "verified_incidents": len(incidents_data),
        "dismissed_alerts": sum(
            1 for alert in alerts_data if alert["status"] == "Dismissed"
        ),
        "model": cameras_data[0]["model"] if cameras_data else "Unknown",
    }