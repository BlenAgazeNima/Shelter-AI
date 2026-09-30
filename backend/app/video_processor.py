from __future__ import annotations

import os
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import cv2
import numpy as np
import torch

torch.set_num_threads(2)
cv2.setNumThreads(1)

from .database import create_alert

try:
    from ultralytics import YOLO
except Exception:  # pragma: no cover
    YOLO = None

BASE_DIR = Path(__file__).resolve().parents[1]
VIDEO_DIR = BASE_DIR / "videos"
MODEL_NAME = os.getenv("SHELTER_YOLO_MODEL", str(BASE_DIR / "yolo11n.pt"))

CAMERA_CONFIG = {
    "dining": {
        "name": "Dining Hall Camera 01",
        "location": "Dining Hall",
        "video": "dining-hall.mp4",
        "mode": "occupancy",
        "capacity": 30,
    },
    "sleeping": {
        "name": "Sleeping Area Camera 02",
        "location": "Sleeping Area",
        "video": "fall-detection.mp4",
        "mode": "fall",
        "capacity": 25,
    },
    "recreation": {
        "name": "Recreation Room Camera 03",
        "location": "Recreation Room",
        "video": "recreation-room.mp4",
        "mode": "activity",
        "capacity": 20,
    },
    "corridor": {
        "name": "Restricted Corridor Camera 04",
        "location": "Staff Corridor",
        "video": "corridor.mp4",
        "mode": "restricted",
        "capacity": 12,
    },
}

_MODEL: Any = None
_MODEL_ERROR: str | None = None
_MODEL_LOCK = threading.Lock()


def load_model() -> Any:
    """Create one YOLO instance per camera.

    The lock prevents multiple worker threads from racing while the model weights are
    downloaded for the first time. Separate instances keep ByteTrack state isolated
    between camera feeds.
    """
    global _MODEL, _MODEL_ERROR
    with _MODEL_LOCK:
        if _MODEL_ERROR is not None:
            return None
        if YOLO is None:
            _MODEL_ERROR = "Ultralytics is not installed. Run pip install -r requirements.txt"
            return None
        try:
            return YOLO(MODEL_NAME)
        except Exception as exc:
            _MODEL_ERROR = str(exc)
            return None


@dataclass
class CameraState:
    camera_id: str
    config: dict[str, Any]
    latest_jpeg: bytes | None = None
    people: int = 0
    fps: float = 0.0
    status: str = "Starting"
    ai_status: str = "Loading model"
    last_event: str = "No active incident"
    confidence: float = 0.0
    frame_number: int = 0
    model_name: str = MODEL_NAME
    track_history: dict[int, deque] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def snapshot(self) -> dict[str, Any]:
        with self.lock:
            return {
                "camera_id": self.camera_id,
                "name": self.config["name"],
                "location": self.config["location"],
                "mode": self.config["mode"],
                "capacity": self.config["capacity"],
                "people": self.people,
                "fps": round(self.fps, 1),
                "status": self.status,
                "ai_status": self.ai_status,
                "last_event": self.last_event,
                "confidence": round(self.confidence, 2),
                "frame_number": self.frame_number,
                "model": self.model_name,
                "source": "recording",
                "video_url": f"/api/media/{self.camera_id}",
                "analysis_url": f"/api/cameras/{self.camera_id}/frame",
            }


class VideoProcessor:
    def __init__(self, camera_id: str, config: dict[str, Any]):
        self.state = CameraState(camera_id, config)
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.last_alert_time: dict[str, float] = {}
        self.previous_gray: np.ndarray | None = None

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()

    def _can_alert(self, key: str, cooldown: int = 20) -> bool:
        now = time.time()
        if now - self.last_alert_time.get(key, 0) >= cooldown:
            self.last_alert_time[key] = now
            return True
        return False

    def _emit_alert(self, title: str, severity: str, confidence: float, details: str) -> None:
        if self._can_alert(title):
            create_alert(self.state.camera_id, title, severity, confidence, details)
        with self.state.lock:
            self.state.last_event = title
            self.state.confidence = confidence

    def _run(self) -> None:
        model = load_model()
        with self.state.lock:
            self.state.ai_status = "YOLO active" if model is not None else f"Model unavailable: {_MODEL_ERROR}"

        path = VIDEO_DIR / self.state.config["video"]
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            with self.state.lock:
                self.state.status = f"Cannot open {path.name}"
            return

        source_fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        frame_delay = 0.25  # Four independent CPU feeds; avoid saturating the computer.
        stride = max(1, round(source_fps * frame_delay))
        last_tick = time.perf_counter()
        smoothed_fps = 0.0

        while not self.stop_event.is_set():
            started = time.perf_counter()
            ok, frame = cap.read()
            if not ok:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                self.previous_gray = None
                self.state.track_history.clear()
                if model is not None and getattr(model, 'predictor', None):
                    for tracker in getattr(model.predictor, 'trackers', []):
                        tracker.reset()
                continue

            if frame.shape[1] > 640:
                frame = cv2.resize(frame, (640, round(frame.shape[0] * 640 / frame.shape[1])))
            annotated = frame.copy()
            detections: list[dict[str, Any]] = []

            if model is not None:
                try:
                    results = model.track(
                        frame,
                        persist=True,
                        classes=[0],
                        conf=0.35,
                        iou=0.5,
                        tracker="bytetrack.yaml",
                        verbose=False,
                        imgsz=640,
                        device="cpu",
                    )
                    result = results[0]
                    with self.state.lock:
                        self.state.ai_status = "YOLO active"
                    boxes = result.boxes
                    if boxes is not None:
                        xyxy = boxes.xyxy.cpu().numpy()
                        confs = boxes.conf.cpu().numpy()
                        ids = (
                            boxes.id.int().cpu().tolist()
                            if boxes.id is not None
                            else list(range(len(xyxy)))
                        )
                        for coords, confidence, track_id in zip(xyxy, confs, ids):
                            x1, y1, x2, y2 = map(int, coords)
                            detections.append(
                                {
                                    "box": (x1, y1, x2, y2),
                                    "confidence": float(confidence),
                                    "track_id": int(track_id),
                                }
                            )
                except Exception as exc:
                    with self.state.lock:
                        self.state.ai_status = f"YOLO error: {exc}"

            with self.state.lock:
                self.state.people = len(detections)
            self._draw_and_analyse(annotated, detections)
            self._draw_header(annotated)

            ok, encoded = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 82])
            if ok:
                now = time.perf_counter()
                instantaneous = 1 / max(now - last_tick, 0.001)
                smoothed_fps = instantaneous if smoothed_fps == 0 else 0.9 * smoothed_fps + 0.1 * instantaneous
                last_tick = now
                with self.state.lock:
                    self.state.latest_jpeg = encoded.tobytes()
                    self.state.people = len(detections)
                    self.state.fps = smoothed_fps
                    self.state.status = "Analysing recording"
                    self.state.frame_number += 1

            elapsed = time.perf_counter() - started
            for _ in range(stride - 1):
                cap.grab()
            self.stop_event.wait(max(0.0, frame_delay - elapsed))

        cap.release()

    def _draw_header(self, frame: np.ndarray) -> None:
        height, width = frame.shape[:2]
        cv2.rectangle(frame, (0, 0), (width, 44), (15, 48, 44), -1)
        label = f"{self.state.config['name']} | YOLO + ByteTrack | People: {self.state.people}"
        cv2.putText(frame, label, (14, 29), cv2.FONT_HERSHEY_SIMPLEX, 0.62, (255, 255, 255), 2)
        cv2.circle(frame, (width - 25, 22), 7, (41, 211, 120), -1)

    def _draw_and_analyse(self, frame: np.ndarray, detections: list[dict[str, Any]]) -> None:
        height, width = frame.shape[:2]
        mode = self.state.config["mode"]
        restricted_x = int(width * 0.68)

        if mode == "restricted":
            cv2.rectangle(frame, (restricted_x, 44), (width - 1, height - 1), (0, 0, 255), 2)
            cv2.putText(frame, "RESTRICTED", (restricted_x + 8, 72), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 0, 255), 2)

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        motion_score = 0.0
        if self.previous_gray is not None:
            motion_score = float(np.mean(cv2.absdiff(gray, self.previous_gray)))
        self.previous_gray = gray

        possible_fall = False
        restricted_entry = False
        max_conf = 0.0

        for detection in detections:
            x1, y1, x2, y2 = detection["box"]
            confidence = detection["confidence"]
            track_id = detection["track_id"]
            max_conf = max(max_conf, confidence)
            box_width = max(1, x2 - x1)
            box_height = max(1, y2 - y1)
            center = ((x1 + x2) // 2, (y1 + y2) // 2)

            history = self.state.track_history.setdefault(track_id, deque(maxlen=30))
            history.append(center)
            points = np.array(history, dtype=np.int32).reshape((-1, 1, 2))
            if len(points) > 1:
                cv2.polylines(frame, [points], False, (255, 190, 0), 2)

            color = (42, 179, 105)
            label = f"Person {track_id} {confidence:.0%}"

            if mode == "fall" and box_width / box_height > 1.15 and y2 > int(height * 0.62):
                possible_fall = True
                color = (0, 0, 255)
                label = f"POSSIBLE FALL {confidence:.0%}"

            if mode == "restricted" and center[0] >= restricted_x:
                restricted_entry = True
                color = (0, 0, 255)
                label = f"RESTRICTED ENTRY #{track_id}"

            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(frame, label, (x1, max(58, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.53, color, 2)

        capacity = self.state.config["capacity"]
        if mode == "occupancy" and len(detections) >= int(capacity * 0.8):
            self._emit_alert(
                "Occupancy approaching capacity",
                "Medium",
                max_conf or 0.8,
                f"{len(detections)} people detected; configured capacity is {capacity}.",
            )
        elif possible_fall:
            self._emit_alert(
                "Possible fall detected",
                "Critical",
                max_conf or 0.75,
                "A person bounding box is horizontal and close to the floor. Officer verification required.",
            )
        elif restricted_entry:
            self._emit_alert(
                "Restricted-area entry",
                "High",
                max_conf or 0.8,
                "A tracked person crossed the configured virtual restricted zone.",
            )
        elif mode == "activity" and motion_score > 20 and len(detections) >= 2:
            self._emit_alert(
                "Unusual group activity",
                "Medium",
                min(0.99, 0.55 + motion_score / 100),
                "High frame-to-frame motion was observed around multiple detected people.",
            )
        else:
            with self.state.lock:
                self.state.last_event = "No active incident"
                self.state.confidence = max_conf


class ProcessorManager:
    def __init__(self) -> None:
        self.processors = {
            camera_id: VideoProcessor(camera_id, config)
            for camera_id, config in CAMERA_CONFIG.items()
        }

    def start(self) -> None:
        for processor in self.processors.values():
            processor.start()

    def stop(self) -> None:
        for processor in self.processors.values():
            processor.stop()
        for processor in self.processors.values():
            if processor.thread.is_alive():
                processor.thread.join(timeout=5)

    def states(self) -> list[dict[str, Any]]:
        return [processor.state.snapshot() for processor in self.processors.values()]

    def get(self, camera_id: str) -> VideoProcessor | None:
        return self.processors.get(camera_id)
