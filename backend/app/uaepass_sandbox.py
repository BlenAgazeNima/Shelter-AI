"""Local UAE PASS presentation flow, with saved identities and number matching."""
import hashlib
import os
import secrets
import time
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from . import cases
from .accounts import Account, add_account, session_response

router=APIRouter(prefix='/api/auth/simulation')
CHALLENGES={}
STAFF_IDENTITIES=[
    ('manager@shelter.test','Aisha Hassan','supervisor'),
    ('security@shelter.test','Omar Ali','security'),
    ('case@shelter.test','Mariam Ahmed','caseworker'),
    ('medical@shelter.test','Dr Sara Khalid','medical'),
    ('travel@shelter.test','Khalid Salem','travel'),
]

def identity_prefix(identifier):
    return 'sandbox-test-'+hashlib.sha256(identifier.strip().lower().encode()).hexdigest()[:20]+'-'

def seed_staff_identities():
    if os.getenv('SHELTER_AUTH_MODE')!='simulation' or cases.DB.name!='sandbox-cases.db': return
    with cases.connection() as db:
        for identifier,name,role in STAFF_IDENTITIES:
            key=identity_prefix(identifier)+role
            if not db.execute('SELECT 1 FROM accounts WHERE username=?',(key,)).fetchone():
                add_account(db,Account(username=key,password=secrets.token_urlsafe(32),name=name,role=role))

def require_sandbox(request):
    if os.getenv('SHELTER_AUTH_MODE')!='simulation' or cases.DB.name!='sandbox-cases.db':
        raise HTTPException(404,'Local sign-in is not enabled.')
    if request.client.host not in {'127.0.0.1','::1','testclient'}:
        raise HTTPException(403,'This sign-in is available only on the local computer.')

class ChallengeRequest(BaseModel):
    identifier: str = Field(min_length=1,max_length=120)
    audience: Literal['resident','employee']

class NumberApproval(ChallengeRequest):
    challenge_id: str = Field(min_length=20,max_length=100)
    selected_number: int

def find_identity(db,identifier,audience):
    # Names, roles and case assignments come exclusively from saved accounts.
    prefix=identity_prefix(identifier)
    linked_uuid='local:'+hashlib.sha256(identifier.strip().lower().encode()).hexdigest()
    rows=db.execute('SELECT id,name,role,case_id,active FROM accounts WHERE substr(username,1,?)=? OR uaepass_uuid=?',(len(prefix),prefix,linked_uuid)).fetchall()
    rows=[r for r in rows if (r[2]=='resident')==(audience=='resident')]
    if len(rows)!=1 or not rows[0][4]:
        raise HTTPException(403,'This identity is not linked to an active '+audience+' account. Please contact the shelter team or use your shelter login.')
    row=rows[0]
    if audience=='resident':
        if not row[3]: raise HTTPException(403,'No resident record is linked to this account.')
        cases.read_case(db,row[3])
    return dict(zip(('uuid','name','role','case_id'),row[:4]))

@router.post('/challenge')
def challenge(payload: ChallengeRequest,request: Request):
    require_sandbox(request)
    now=time.time()
    for token in list(CHALLENGES):
        if CHALLENGES[token]['expires']<now:CHALLENGES.pop(token,None)
    if len(CHALLENGES)>=200:raise HTTPException(429,'Please wait before requesting another number.')
    with cases.connection() as db:find_identity(db,payload.identifier,payload.audience)
    number=secrets.randbelow(90)+10
    choices={number}
    while len(choices)<3:choices.add(secrets.randbelow(90)+10)
    choices=list(choices);secrets.SystemRandom().shuffle(choices)
    token=secrets.token_urlsafe(32)
    CHALLENGES[token]=dict(number=number,identifier=payload.identifier.strip().lower(),audience=payload.audience,expires=now+120,host=request.client.host)
    return dict(challenge_id=token,number=number,choices=choices,expires_at=now+120)

@router.post('/complete')
def complete(payload: NumberApproval,request: Request):
    require_sandbox(request)
    item=CHALLENGES.pop(payload.challenge_id,None)
    if not item or item['expires']<time.time():raise HTTPException(401,'Login request expired. Please start again.')
    if item['host']!=request.client.host or item['identifier']!=payload.identifier.strip().lower() or item['audience']!=payload.audience or item['number']!=payload.selected_number:
        raise HTTPException(401,'The login request does not match. Please start again.')
    with cases.connection() as db:
        user=find_identity(db,payload.identifier,payload.audience)
        db.execute('INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)',(user['uuid'],user['case_id'] or 'system','Local number-matched sign-in'))
    return session_response({**user,'simulation':True})
