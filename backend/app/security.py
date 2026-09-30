"""Security-only roster and recorded gate/transfer events."""
import json
from fastapi import APIRouter,Request,HTTPException
from pydantic import BaseModel,Field
from typing import Literal
from .cases import connection,identity,require,read_case

router=APIRouter(prefix='/api/security')

def schema(db):
    db.execute('CREATE TABLE IF NOT EXISTS movements (id INTEGER PRIMARY KEY,case_id TEXT,resident TEXT,event TEXT,location TEXT,notes TEXT,officer TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP)')

@router.get('/roster')
def roster(request:Request):
    require(identity(request),'security','supervisor')
    with connection() as db:
        records=[json.loads(row[0]) for row in db.execute('SELECT body FROM cases')]
    return [{'id':r['id'],'name':r['name'],'status':r['status'],'transfer':r['travel']['transfer']} for r in records]

@router.get('/movements')
def movements(request:Request):
    require(identity(request),'security','supervisor')
    with connection() as db:
        schema(db)
        return [dict(zip(('id','case_id','resident','event','location','notes','officer','created'),row)) for row in db.execute('SELECT * FROM movements ORDER BY id DESC LIMIT 500')]

class Movement(BaseModel):
    case_id:str
    event:Literal['Arrival','Internal transfer','Airport handover','Return']
    location:str=Field(min_length=1,max_length=150)
    notes:str=Field(min_length=1,max_length=1000)

@router.post('/movements',status_code=201)
def record(payload:Movement,request:Request):
    user=identity(request);require(user,'security','supervisor')
    if not payload.location.strip() or not payload.notes.strip():
        raise HTTPException(422,'Enter the location and handover details.')
    with connection() as db:
        resident=read_case(db,payload.case_id);schema(db)
        if payload.event=='Airport handover' and (not all(t['done'] for t in resident['tasks']) or not all(resident['travel'].values())):
            raise HTTPException(409,'All departure-readiness checks must be complete before airport handover.')
        db.execute('INSERT INTO movements(case_id,resident,event,location,notes,officer) VALUES (?,?,?,?,?,?)',(resident['id'],resident['name'],payload.event,payload.location.strip(),payload.notes.strip(),user['name']))
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],resident['id'],'Security movement: '+payload.event))
    return {'saved':True}
