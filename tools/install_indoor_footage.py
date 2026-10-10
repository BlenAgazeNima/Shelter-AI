"""Install licensed indoor recordings; originals stay in a local backup folder."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import shutil
import urllib.request
import subprocess
import cv2
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
VIDEOS = ROOT / 'backend' / 'videos'
ITEMS = [('18533896','dining-hall'), ('5203513','fall-detection'),
         ('31789801','recreation-room'), ('6130553','corridor')]

def install(item):
    identifier,name = item
    source = VIDEOS / (name+'.download.mp4')
    request = urllib.request.Request('https://www.pexels.com/download/video/'+identifier+'/',headers={'User-Agent':'Mozilla/5.0'})
    with urllib.request.urlopen(request,timeout=90) as response:
        source.write_bytes(response.read())
    target = VIDEOS / (name+'.new.mp4')
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-i',str(source),'-t','30','-an','-vf','scale=960:-2','-c:v','libx264','-preset','fast','-crf','25','-movflags','+faststart',str(target)],check=True,capture_output=True)
    cap = cv2.VideoCapture(str(target))
    ok,frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError('Unreadable recording: '+name)
    backup = VIDEOS / 'originals'
    backup.mkdir(exist_ok=True)
    existing = VIDEOS / (name+'.mp4')
    if existing.exists() and not (backup/existing.name).exists():
        shutil.copy2(existing,backup/existing.name)
    target.replace(existing)
    source.unlink()
    print('Installed '+name,flush=True)

if __name__ == '__main__':
    with ThreadPoolExecutor(3) as pool:
        list(pool.map(install,ITEMS))
