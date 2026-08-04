from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = ROOT / "backend" / "videos"
MARKER = VIDEO_DIR / ".real_footage_installed"

# Real recordings hosted on Wikimedia Commons with reuse licences shown on each file page.
VIDEOS = [
    {
        "title": "File:People waiting to cross the street.webm",
        "output": "dining-hall.mp4",
        "label": "Occupancy / group monitoring",
        "page": "https://commons.wikimedia.org/wiki/File:People_waiting_to_cross_the_street.webm",
    },
    {
        "title": "File:Falling man.webm",
        "output": "fall-detection.mp4",
        "label": "Fall detection",
        "page": "https://commons.wikimedia.org/wiki/File:Falling_man.webm",
    },
    {
        "title": "File:Unserious fight on a birthday party.webm",
        "output": "recreation-room.mp4",
        "label": "Staged altercation / activity monitoring",
        "page": "https://commons.wikimedia.org/wiki/File:Unserious_fight_on_a_birthday_party.webm",
    },
    {
        "title": "File:Big City Life.webm",
        "output": "corridor.mp4",
        "label": "Pedestrian tracking / restricted-zone demonstration",
        "page": "https://commons.wikimedia.org/wiki/File:Big_City_Life.webm",
    },
]


def commons_download_url(title: str) -> str:
    query = urllib.parse.urlencode({
        "action": "query",
        "format": "json",
        "formatversion": "2",
        "prop": "imageinfo",
        "iiprop": "url",
        "titles": title,
        "origin": "*",
    })
    api = f"https://commons.wikimedia.org/w/api.php?{query}"
    req = urllib.request.Request(api, headers={"User-Agent": "GDRFA-AI-Shelter-Academic-Prototype/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = json.load(response)
    pages = data.get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        raise RuntimeError(f"Wikimedia Commons returned no media URL for {title}")
    return pages[0]["imageinfo"][0]["url"]


def download(url: str, target: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "GDRFA-AI-Shelter-Academic-Prototype/1.0"})
    with urllib.request.urlopen(req, timeout=180) as response, target.open("wb") as out:
        total = int(response.headers.get("Content-Length", 0))
        done = 0
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"    {done * 100 / total:5.1f}%", end="\r", flush=True)
    print("    download complete" + " " * 12)


def ffmpeg_executable() -> str:
    system_ffmpeg = shutil.which("ffmpeg")
    if system_ffmpeg:
        return system_ffmpeg
    try:
        import imageio_ffmpeg  # type: ignore
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as exc:
        raise RuntimeError(
            "FFmpeg is unavailable. Run SETUP_WINDOWS.bat first so imageio-ffmpeg is installed."
        ) from exc


def convert_to_mp4(source: Path, target: Path) -> None:
    ffmpeg = ffmpeg_executable()
    cmd = [
        ffmpeg, "-y", "-i", str(source),
        "-t", "35",                 # short repeatable demonstration clip
        "-vf", "scale='min(960,iw)':-2",
        "-an", "-c:v", "libx264", "-preset", "veryfast",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(target),
    ]
    result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Video conversion failed for {source.name}:\n{result.stderr[-1200:]}")
    if not target.exists() or target.stat().st_size < 10_000:
        raise RuntimeError(f"Converted video was not created correctly: {target}")


def main() -> int:
    force = "--force" in sys.argv
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    if MARKER.exists() and not force:
        print("Real footage is already installed. Use --force to download it again.")
        return 0

    print("\nProject 1 — GDRFA AI Shelter")
    print("Automatically downloading real, reusable video footage...")
    print("This may take several minutes on the first run.\n")

    installed = []
    with tempfile.TemporaryDirectory(prefix="gdrfa_real_video_") as temp_name:
        temp = Path(temp_name)
        for index, item in enumerate(VIDEOS, start=1):
            print(f"[{index}/{len(VIDEOS)}] {item['label']}")
            media_url = commons_download_url(item["title"])
            extension = Path(urllib.parse.urlparse(media_url).path).suffix or ".webm"
            raw = temp / f"source_{index}{extension}"
            output = VIDEO_DIR / item["output"]
            download(media_url, raw)
            print("    converting to MP4...")
            convert_to_mp4(raw, output)
            print(f"    ready: {output.name} ({output.stat().st_size / 1024 / 1024:.1f} MB)\n")
            installed.append(item)

    MARKER.write_text(
        "Real footage downloaded automatically from Wikimedia Commons.\n" +
        "\n".join(f"{x['output']} | {x['page']}" for x in installed),
        encoding="utf-8",
    )
    print("All four real MP4 feeds are installed and ready for OpenCV/YOLO processing.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled.")
        raise SystemExit(130)
    except Exception as exc:
        print(f"\nERROR: {exc}")
        print("Check your internet connection, then run DOWNLOAD_REAL_FOOTAGE.bat again.")
        raise SystemExit(1)
