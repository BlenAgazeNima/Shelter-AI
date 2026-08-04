from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import webbrowser
import zipfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = PROJECT_ROOT / "backend" / "videos"

TARGETS = {
    "dining": VIDEO_DIR / "dining-hall.mp4",
    "fall": VIDEO_DIR / "fall-detection.mp4",
    "recreation": VIDEO_DIR / "recreation-room.mp4",
    "corridor": VIDEO_DIR / "corridor.mp4",
}

SOURCES = {
    "dining": "https://www.pexels.com/video/people-inside-a-cafe-6828728/",
    "corridor": "https://www.pexels.com/video/people-walking-on-indoor-floor-path-35767993/",
    "mall": "https://www.pexels.com/video/people-walking-inside-the-mall-4750042/",
    "fall_dataset": "https://fenix.ur.edu.pl/~mkepski/ds/uf.html",
    "fight_dataset": "https://huggingface.co/datasets/DanJoshua/RWF-2000",
}

UR_FALL_RGB_ZIP = "https://fenix.ur.edu.pl/~mkepski/ds/data/fall-01-cam0-rgb.zip"
UR_ADL_RGB_ZIP = "https://fenix.ur.edu.pl/~mkepski/ds/data/adl-01-cam0-rgb.zip"


def print_header() -> None:
    print("\nGDRFA AI Shelter - Real Footage Importer")
    print("=" * 48)
    print("This tool replaces the included demo clips with real recorded footage.")
    print("Use only footage whose licence and privacy terms permit your academic use.\n")


def download(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    print(f"Downloading: {url}")
    with urllib.request.urlopen(url, timeout=120) as response, destination.open("wb") as out:
        total = int(response.headers.get("Content-Length", "0"))
        received = 0
        while True:
            block = response.read(1024 * 1024)
            if not block:
                break
            out.write(block)
            received += len(block)
            if total:
                print(f"  {received * 100 / total:5.1f}%", end="\r")
    print("\nDownload complete.")


def image_sequence_to_mp4(zip_path: Path, output: Path, fps: float = 25.0) -> None:
    try:
        import cv2  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "OpenCV is required. Install backend requirements first, or run: "
            ".\\.venv\\Scripts\\python.exe -m pip install opencv-python"
        ) from exc

    with tempfile.TemporaryDirectory(prefix="gdrfa_footage_") as temp_dir:
        temp = Path(temp_dir)
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(temp)

        frames = sorted(
            [p for p in temp.rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg"}],
            key=lambda p: p.name,
        )
        if not frames:
            raise RuntimeError("No image frames were found in the downloaded dataset archive.")

        first = cv2.imread(str(frames[0]))
        if first is None:
            raise RuntimeError(f"Could not read first frame: {frames[0]}")
        height, width = first.shape[:2]
        output.parent.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(
            str(output), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)
        )
        if not writer.isOpened():
            raise RuntimeError("OpenCV could not create the MP4 output file.")

        try:
            for index, frame_path in enumerate(frames, start=1):
                frame = cv2.imread(str(frame_path))
                if frame is None:
                    continue
                if frame.shape[1] != width or frame.shape[0] != height:
                    frame = cv2.resize(frame, (width, height))
                writer.write(frame)
                if index % 50 == 0:
                    print(f"  Converted {index}/{len(frames)} frames", end="\r")
        finally:
            writer.release()
        print(f"\nCreated real-footage MP4: {output}")


def install_official_ur_clips() -> None:
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="gdrfa_urfd_") as temp_dir:
        temp = Path(temp_dir)
        fall_zip = temp / "fall-rgb.zip"
        adl_zip = temp / "adl-rgb.zip"
        download(UR_FALL_RGB_ZIP, fall_zip)
        image_sequence_to_mp4(fall_zip, TARGETS["fall"], fps=25.0)
        download(UR_ADL_RGB_ZIP, adl_zip)
        image_sequence_to_mp4(adl_zip, TARGETS["recreation"], fps=25.0)

    print("\nInstalled:")
    print(f"  Fall feed:       {TARGETS['fall']}")
    print(f"  Activity feed:   {TARGETS['recreation']}")
    print("Source: University of Rzeszow UR Fall Detection Dataset")
    print("Licence: CC BY-NC-SA 4.0, non-commercial academic use.")


def choose_file(title: str) -> Path | None:
    try:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        selected = filedialog.askopenfilename(
            title=title,
            filetypes=[("Video files", "*.mp4 *.mov *.avi *.mkv"), ("All files", "*.*")],
        )
        root.destroy()
        return Path(selected) if selected else None
    except Exception:
        raw = input(f"Enter the complete path for {title} (or leave blank): ").strip().strip('"')
        return Path(raw) if raw else None


def convert_or_copy(source: Path, destination: Path) -> None:
    if not source.exists():
        raise FileNotFoundError(f"File not found: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)

    if source.suffix.lower() == ".mp4":
        shutil.copy2(source, destination)
        print(f"Imported {source.name} -> {destination.name}")
        return

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        subprocess.run(
            [ffmpeg, "-y", "-i", str(source), "-c:v", "libx264", "-an", str(destination)],
            check=True,
        )
        print(f"Converted {source.name} -> {destination.name}")
        return

    try:
        import cv2  # type: ignore
    except ImportError as exc:
        raise RuntimeError("Install OpenCV or FFmpeg to convert non-MP4 footage.") from exc

    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not open: {source}")
    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    writer = cv2.VideoWriter(
        str(destination), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)
    )
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        writer.write(frame)
    capture.release()
    writer.release()
    print(f"Converted {source.name} -> {destination.name}")


def open_curated_sources() -> None:
    print("Opening curated source pages in your browser...")
    for url in SOURCES.values():
        webbrowser.open_new_tab(url)
    print("\nDownload clips only from pages that permit your intended use.")
    print("After downloading them, return here and select the files to import.")


def import_local_clips() -> None:
    prompts = [
        ("dining", "real dining/cafeteria or indoor occupancy video"),
        ("corridor", "real corridor/hallway pedestrian video"),
        ("recreation", "real activity or licensed staged altercation video"),
        ("fall", "real licensed staged fall video"),
    ]
    for key, description in prompts:
        selected = choose_file(description)
        if selected:
            convert_or_copy(selected, TARGETS[key])
        else:
            print(f"Skipped {key}; existing video remains unchanged.")


def show_status() -> None:
    print("\nCurrent footage files:")
    for key, path in TARGETS.items():
        status = f"{path.stat().st_size / (1024 * 1024):.1f} MB" if path.exists() else "MISSING"
        print(f"  {key:11} {path.name:24} {status}")


def interactive() -> None:
    print_header()
    while True:
        print("1. Automatically install two real UR Fall Dataset feeds")
        print("2. Open curated real-footage source pages")
        print("3. Import your downloaded MP4 clips into all four feeds")
        print("4. Show current footage status")
        print("5. Exit")
        choice = input("\nChoose 1-5: ").strip()
        try:
            if choice == "1":
                install_official_ur_clips()
            elif choice == "2":
                open_curated_sources()
            elif choice == "3":
                import_local_clips()
            elif choice == "4":
                show_status()
            elif choice == "5":
                return
            else:
                print("Please enter a number from 1 to 5.")
        except Exception as exc:
            print(f"\nImport failed: {exc}\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import licensed real footage into the shelter project")
    parser.add_argument("--install-ur", action="store_true", help="Download and install UR fall + ADL clips")
    parser.add_argument("--open-sources", action="store_true", help="Open curated source pages")
    parser.add_argument("--status", action="store_true", help="Show footage status")
    args = parser.parse_args()

    if args.install_ur:
        install_official_ur_clips()
    elif args.open_sources:
        open_curated_sources()
    elif args.status:
        show_status()
    else:
        interactive()


if __name__ == "__main__":
    main()
