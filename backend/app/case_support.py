"""Private document storage and resident/staff messages."""
import os
import secrets
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel,Field
from .cases import connection, identity, read_case, require

router=APIRouter(prefix='/api/cases')
UPLOADS=Path(os.getenv('SHELTER_UPLOAD_DIR',str(Path(__file__).resolve().parents[1]/'data'/('sandbox-documents' if os.getenv('SHELTER_AUTH_MODE')=='simulation' else 'documents'))))

def access(db,case_id,user):
    require(user,'supervisor','caseworker','medical','travel','resident')
    record=read_case(db,case_id)
    if user['role']=='resident' and user.get('case_id')!=case_id:
        raise HTTPException(403,'This case is not assigned to you.')
    return record

def schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, case_id TEXT, name TEXT, size INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP)')
    db.execute('CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, case_id TEXT, sender TEXT, sender_role TEXT, body TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP)')

@router.get('/{case_id}/files')
def files(case_id: str,request: Request):
    user=identity(request)
    with connection() as db:
        access(db,case_id,user);schema(db)
        return [dict(zip(('id','name','size','created'),row)) for row in db.execute('SELECT id,name,size,created FROM files WHERE case_id=? ORDER BY created DESC',(case_id,))]

@router.post('/{case_id}/files',status_code=201)
async def upload(case_id: str,request: Request,filename: str):
    user=identity(request)
    require(user,'supervisor','caseworker','resident')
    name=Path(filename.replace('\\','/')).name[:150]
    ext=Path(name).suffix.lower()
    if ext not in {'.pdf','.png','.jpg','.jpeg'}:
        raise HTTPException(422,'Upload a PDF, PNG or JPEG document.')
    with connection() as db:
        record=access(db,case_id,user)
        if record['status']=='Departed':
            raise HTTPException(409,'This case is closed.')
    blob=bytearray()
    async for part in request.stream():
        if len(blob)+len(part)>10*1024*1024:
            raise HTTPException(413,'Documents must be 10 MB or smaller.')
        blob.extend(part)
    valid=(ext=='.pdf' and blob.startswith(b'%PDF-')) or (ext=='.png' and blob.startswith(b'\x89PNG\r\n\x1a\n')) or (ext in {'.jpg','.jpeg'} and blob.startswith(b'\xff\xd8\xff'))
    if not valid:
        raise HTTPException(422,'The file content does not match its document type.')
    file_id=secrets.token_hex(20)
    UPLOADS.mkdir(parents=True,exist_ok=True)
    path=UPLOADS/file_id
    try:
        path.write_bytes(blob)
        with connection() as db:
            record=access(db,case_id,user);schema(db)
            if record['status']=='Departed':
                raise HTTPException(409,'This case was closed while the document was uploading.')
            db.execute('INSERT INTO files(id,case_id,name,size) VALUES (?,?,?,?)',(file_id,case_id,name,len(blob)))
            db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],case_id,'Document uploaded: '+name))
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {'uploaded':True}

@router.get('/{case_id}/files/{file_id}')
def download(case_id: str,file_id: str,request: Request):
    user=identity(request)
    with connection() as db:
        access(db,case_id,user);schema(db)
        row=db.execute('SELECT name FROM files WHERE id=? AND case_id=?',(file_id,case_id)).fetchone()
    if not row or not (UPLOADS/file_id).is_file():
        raise HTTPException(404,'Document not found')
    return FileResponse(UPLOADS/file_id,filename=row[0],media_type='application/octet-stream',headers={'X-Content-Type-Options':'nosniff'})

class Message(BaseModel):
    message: str = Field(min_length=1,max_length=2000)

@router.get('/{case_id}/messages')
def messages(case_id: str,request: Request):
    user=identity(request)
    require(user,'supervisor','caseworker','resident')
    with connection() as db:
        access(db,case_id,user);schema(db)
        return [dict(zip(('id','sender','sender_role','message','created'),row)) for row in db.execute('SELECT id,sender,sender_role,body,created FROM messages WHERE case_id=? ORDER BY id',(case_id,))]

@router.post('/{case_id}/messages',status_code=201)
def send(case_id: str,payload: Message,request: Request):
    user=identity(request)
    require(user,'supervisor','caseworker','resident')
    if not payload.message.strip():
        raise HTTPException(422,'Enter a message.')
    with connection() as db:
        record=access(db,case_id,user);schema(db)
        if record['status']=='Departed':
            raise HTTPException(409,'This case is closed.')
        db.execute('INSERT INTO messages(case_id,sender,sender_role,body) VALUES (?,?,?,?)',(case_id,user['name'],user['role'],payload.message.strip()))
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],case_id,'Message sent'))
    return {'sent':True}
