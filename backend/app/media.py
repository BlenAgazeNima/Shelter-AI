"""Recorded video playback; no synthetic analytics or fake live status."""
from pathlib import Path
from fastapi import APIRouter,HTTPException,Request
from fastapi.responses import FileResponse
from pydantic import BaseModel,Field
from .cases import identity,require
from .database import create_alert

router=APIRouter(prefix='/api')
VIDEOS=Path(__file__).resolve().parents[1]/'videos'
FEEDS={
 'dining':('Dining hall','Dining Hall','dining-hall.mp4'),
 'sleeping':('Sleeping area','Sleeping Area','fall-detection.mp4'),
 'recreation':('Recreation room','Recreation Room','recreation-room.mp4'),
 'corridor':('Staff corridor','Staff Corridor','corridor.mp4'),
}

class RecordedManager:
    def start(self): pass
    def stop(self): pass
    def get(self,camera_id): return None
    def states(self):
        return [dict(camera_id=key,name=name,location=location,status='Recording available' if (VIDEOS/file).is_file() else 'Unavailable',source='recording',people=0,capacity=0,ai_status='Not connected',model='Not connected',video_url=f'/api/media/{key}',fps=0,last_event='Recorded footage',confidence=0) for key,(name,location,file) in FEEDS.items()]

@router.get('/media/{camera_id}')
def video(camera_id: str,request: Request):
    require(identity(request),'supervisor','security')
    if camera_id not in FEEDS or not (VIDEOS/FEEDS[camera_id][2]).is_file():
        raise HTTPException(404,'Recording is unavailable.')
    return FileResponse(VIDEOS/FEEDS[camera_id][2],media_type='video/mp4')

class Report(BaseModel):
    camera_id: str
    title: str = Field(min_length=1,max_length=150)
    details: str = Field(min_length=1,max_length=2000)
    severity: str

@router.post('/safety-reports',status_code=201)
def report(payload: Report,request: Request):
    user=identity(request)
    require(user,'supervisor','security')
    if payload.camera_id not in FEEDS or payload.severity not in {'Low','Medium','High','Critical'}:
        raise HTTPException(422,'Choose a valid recording and severity.')
    return {'id':create_alert(payload.camera_id,payload.title,payload.severity,0,payload.details+'\nReported by: '+user['name'])}
