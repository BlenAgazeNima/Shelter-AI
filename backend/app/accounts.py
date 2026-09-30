"""Password authentication and administrator-managed account provisioning."""
import hashlib
import secrets
import sqlite3
import time
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from .cases import connection, identity, require, read_case, create_session, secure_cookie, ROLES

router = APIRouter(prefix='/api')
ATTEMPTS = {}

class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=200)

class Account(Credentials):
    name: str = Field(min_length=1, max_length=150)
    role: str = 'supervisor'
    case_id: str | None = None
    uaepass_uuid: str | None = None
    identifier: str = Field(default='',max_length=120)

def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
    return salt + ':' + digest

def add_account(db, data):
    if data.role not in ROLES or len(data.password) < 12:
        raise HTTPException(422, 'Choose a valid role and a password of at least 12 characters.')
    if not data.name.strip() or not data.username.strip() or any(c.isspace() for c in data.username):
        raise HTTPException(422, 'Name is required. Usernames cannot contain spaces.')
    case_id = data.case_id if data.role == 'resident' else None
    if data.role == 'resident':
        if not case_id:
            raise HTTPException(422, 'Select the resident record to link.')
        read_case(db, case_id)
    account_id = secrets.token_hex(16)
    linked_uuid=data.uaepass_uuid or None
    if data.identifier.strip():
        import os
        if os.getenv('SHELTER_AUTH_MODE')!='simulation':
            raise HTTPException(422,'Use a verified UAE PASS UUID for connected accounts.')
        linked_uuid='local:'+hashlib.sha256(data.identifier.strip().lower().encode()).hexdigest()
    try:
        db.execute('INSERT INTO accounts(id,username,name,role,case_id,password,uaepass_uuid) VALUES (?,?,?,?,?,?,?)', (account_id,data.username.strip().lower(),data.name.strip(),data.role,case_id,password_hash(data.password),linked_uuid))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'This username or UAE PASS identity is already registered.')
    return dict(uuid=account_id,name=data.name.strip(),role=data.role,case_id=case_id)

def session_response(user):
    token, session = create_session(user)
    response = JSONResponse(session)
    response.set_cookie('shelter_session',token,httponly=True,secure=secure_cookie(),samesite='lax',max_age=3600)
    return response

@router.post('/auth/setup')
def setup(payload: Account, request: Request):
    if request.client.host not in {'127.0.0.1','::1','testclient'}:
        raise HTTPException(403,'First-time setup must be completed on the server computer.')
    with connection() as db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT count(*) FROM accounts').fetchone()[0]:
            raise HTTPException(409,'Setup has already been completed. Please sign in.')
        payload.role='supervisor'
        payload.case_id=None
        user=add_account(db,payload)
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],'system','Administrator account created'))
    return session_response(user)

@router.post('/auth/password')
def login(payload: Credentials, request: Request):
    return password_login(payload, request)

@router.post('/auth/resident')
def resident_login(payload: Credentials, request: Request):
    return password_login(payload, request, resident_only=True)

def password_login(payload, request, resident_only=False):
    key=request.client.host
    now=time.time()
    history=[t for t in ATTEMPTS.get(key,[]) if t>now-300]
    ATTEMPTS[key]=history
    if len(history)>=10:
        raise HTTPException(429,'Too many sign-in attempts. Please wait five minutes.')
    with connection() as db:
        row=db.execute('SELECT id,name,role,case_id,password,active FROM accounts WHERE username=?',(payload.username.strip().lower(),)).fetchone()
    stored=row[4] if row else password_hash('invalid-password', '00'*16)
    if not row or not row[5] or (resident_only and row[2]!='resident') or not secrets.compare_digest(password_hash(payload.password,stored.split(':')[0]),stored):
        history.append(now)
        raise HTTPException(401,'Incorrect username or password.')
    ATTEMPTS.pop(key,None)
    return session_response(dict(zip(('uuid','name','role','case_id'),row[:4])))

class ResidentAccess(BaseModel):
    case_id: str = Field(min_length=1, max_length=80)
    identifier: str = Field(default='',max_length=120)

@router.post('/accounts/resident-access', status_code=201)
def resident_access(payload: ResidentAccess, request: Request):
    user=identity(request)
    require(user,'supervisor')
    code=secrets.token_hex(8).upper()
    with connection() as db:
        record=read_case(db,payload.case_id)
        add_account(db,Account(username=record['id'],password=code,name=record['name'],role='resident',case_id=record['id']))
        if payload.identifier.strip():
            link_resident_identity(db,record,payload.identifier)
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],record['id'],'Resident access code issued'))
    return {'reference':record['id'],'access_code':code,'name':record['name']}

def link_resident_identity(db,record,identifier):
    import os
    if os.getenv('SHELTER_AUTH_MODE')!='simulation':
        raise HTTPException(409,'Use verified UAE PASS UUID linking when connected to UAE PASS.')
    key='sandbox-test-'+hashlib.sha256(identifier.strip().lower().encode()).hexdigest()[:20]+'-resident'
    existing=db.execute('SELECT id,case_id FROM accounts WHERE username=?',(key,)).fetchone()
    if existing:
        if existing[1]!=record['id']:
            raise HTTPException(409,'This identity is already linked to another resident.')
        return
    add_account(db,Account(username=key,password=secrets.token_urlsafe(32),name=record['name'],role='resident',case_id=record['id']))

@router.post('/accounts/resident-link')
def resident_link(payload: ResidentAccess,request: Request):
    user=identity(request);require(user,'supervisor')
    if not payload.identifier.strip():raise HTTPException(422,'Enter the resident UAE PASS identifier.')
    with connection() as db:
        record=read_case(db,payload.case_id)
        link_resident_identity(db,record,payload.identifier)
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],record['id'],'Resident sign-in identity linked'))
    return {'linked':True}

@router.get('/accounts')
def accounts(request: Request):
    require(identity(request),'supervisor')
    with connection() as db:
        return [dict(zip(('id','username','name','role','case_id','uaepass_uuid','active'),row)) for row in db.execute('SELECT id,username,name,role,case_id,uaepass_uuid,active FROM accounts ORDER BY name')]

@router.post('/accounts',status_code=201)
def create(payload: Account, request: Request):
    user=identity(request)
    require(user,'supervisor')
    with connection() as db:
        account=add_account(db,payload)
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],account.get('case_id') or 'system','Account created: '+payload.username))
    return {'created':True}

class AccessChange(BaseModel):
    active: bool

@router.patch('/accounts/{account_id}')
def change_access(account_id: str, payload: AccessChange, request: Request):
    user=identity(request)
    require(user,'supervisor')
    if user['uuid']==account_id:
        raise HTTPException(409,'You cannot disable your own account.')
    with connection() as db:
        if db.execute('UPDATE accounts SET active=? WHERE id=?',(int(payload.active),account_id)).rowcount!=1:
            raise HTTPException(404,'Account not found')
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],'system','Account access changed: '+account_id))
    return {'updated':True}

class PasswordChange(BaseModel):
    current: str = Field(max_length=200)
    replacement: str = Field(min_length=12,max_length=200)

@router.post('/auth/change-password')
def change_password(payload: PasswordChange,request: Request):
    user=identity(request)
    with connection() as db:
        row=db.execute('SELECT password FROM accounts WHERE id=?',(user['uuid'],)).fetchone()
        if not row or not secrets.compare_digest(password_hash(payload.current,row[0].split(':')[0]),row[0]):
            raise HTTPException(403,'Current password is incorrect.')
        db.execute('UPDATE accounts SET password=? WHERE id=?',(password_hash(payload.replacement),user['uuid']))
        # End every prior session for this account, then issue a fresh session.
        import json
        for token_hash,body in db.execute('SELECT token_hash,body FROM sessions').fetchall():
            if json.loads(body)['uuid']==user['uuid']:
                db.execute('DELETE FROM sessions WHERE token_hash=?',(token_hash,))
    return session_response({k:user[k] for k in ('uuid','name','role','case_id')})
