"""Resident case API. UAE PASS identities must be provisioned by an administrator."""
import base64
import hashlib
import json
import os
import secrets
import sqlite3
import time
import urllib.parse
import urllib.request
from pathlib import Path
from datetime import date
from contextlib import contextmanager
from typing import Literal
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api")
DB = Path(os.getenv("SHELTER_CASE_DB", str(Path(__file__).resolve().parents[1] / "data" / ("sandbox-cases.db" if os.getenv('SHELTER_AUTH_MODE')=='simulation' else "cases.db"))))
SESSIONS = {}
STATES = {}
ROLES = {"supervisor", "security", "caseworker", "medical", "travel", "resident"}
STEPS = [("identity", "Identity reviewed", "caseworker"), ("consular", "Consular coordination", "caseworker"), ("documents", "Travel document received", "caseworker"), ("medical", "Medical clearance", "medical"), ("fitness", "Fit to travel", "medical"), ("permit", "Exit permit issued", "travel"), ("ticket", "Ticket confirmed", "travel"), ("transfer", "Airport transfer confirmed", "travel")]

@contextmanager
def connection():
    DB.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB)
    db.execute("CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, admission_ref TEXT UNIQUE, version INTEGER, body TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, at TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, case_id TEXT, action TEXT)")
    db.execute("CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT UNIQUE, name TEXT, role TEXT, case_id TEXT, password TEXT, uaepass_uuid TEXT UNIQUE, active INTEGER DEFAULT 1)")
    db.execute("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, body TEXT, expires REAL)")
    try:
        with db:
            yield db
    finally:
        db.close()

def identity(request):
    token = request.cookies.get("shelter_session", "")
    user = SESSIONS.get(token)
    if not user and token:
        with connection() as db:
            row = db.execute('SELECT body FROM sessions WHERE token_hash=? AND expires>?', (hashlib.sha256(token.encode()).hexdigest(), time.time())).fetchone()
            user = json.loads(row[0]) if row else None
            if user:
                account = db.execute('SELECT active FROM accounts WHERE id=?', (user['uuid'],)).fetchone()
                if account and not account[0]:
                    user = None
    if not user or user["expires"] < time.time():
        SESSIONS.pop(token, None)
        raise HTTPException(401, "Your session has ended. Please sign in.")
    if request.method not in {"GET", "HEAD", "OPTIONS"} and not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), user["csrf"]):
        raise HTTPException(403, "Session verification failed. Sign in again.")
    return user

def require(user, *roles):
    if user["role"] not in roles:
        raise HTTPException(403, "Your role cannot perform this action")

def project(record, user):
    record = json.loads(json.dumps(record))
    if user["role"] == "resident":
        if user.get("case_id") != record["id"]:
            raise HTTPException(403, "This record is not assigned to you")
        return {key: record[key] for key in ("id", "name", "language", "status", "updates", "travel", "updated")}
    if user["role"] not in {"medical", "supervisor"}:
        record.pop("medical", None)
    return record

def read_case(db, case_id):
    row = db.execute("SELECT body FROM cases WHERE id=?", (case_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Resident record not found")
    return json.loads(row[0])

@router.get("/auth/config")
def config():
    with connection() as db:
        setup = db.execute('SELECT count(*) FROM accounts').fetchone()[0] == 0
    simulation = os.getenv('SHELTER_AUTH_MODE')=='simulation' and DB.name=='sandbox-cases.db'
    return {"configured": all(os.getenv(k) for k in ("UAEPASS_CLIENT_ID", "UAEPASS_CLIENT_SECRET", "UAEPASS_REDIRECT_URI")), "setup_required": setup and not simulation, "simulation": simulation}

@router.get("/auth/login")
def login():
    if not config()["configured"]:
        raise HTTPException(503, "UAE PASS onboarding credentials and user assignments are required")
    now = time.time()
    for key in list(STATES):
        if STATES[key] < now:
            STATES.pop(key, None)
    state = secrets.token_urlsafe(32)
    STATES[state] = now + 300
    params = dict(response_type="code", client_id=os.environ["UAEPASS_CLIENT_ID"], redirect_uri=os.environ["UAEPASS_REDIRECT_URI"], scope="urn:uae:digitalid:profile:general", state=state, acr_values="urn:safelayer:tws:policies:authentication:level:low")
    response = RedirectResponse(provider() + "/authorize?" + urllib.parse.urlencode(params))
    response.set_cookie("shelter_oauth", state, httponly=True, secure=secure_cookie(), samesite="lax", max_age=300)
    return response

def secure_cookie():
    return os.getenv("SHELTER_LOCAL_HTTP") != "1"

def provider():
    return "https://id.uaepass.ae/idshub" if os.getenv("UAEPASS_ENV") == "production" else "https://stg-id.uaepass.ae/idshub"

@router.get("/auth/callback")
def callback(request: Request, state: str = "", code: str = "", error: str = ""):
    expiry = STATES.pop(state, 0)
    if not state or expiry < time.time() or not secrets.compare_digest(state, request.cookies.get("shelter_oauth", "")):
        raise HTTPException(400, "Invalid or expired sign-in request")
    if error or not code:
        return RedirectResponse("/?auth_error=cancelled")
    try:
        credentials = base64.b64encode((os.environ["UAEPASS_CLIENT_ID"] + ":" + os.environ["UAEPASS_CLIENT_SECRET"]).encode()).decode()
        query = urllib.parse.urlencode(dict(grant_type="authorization_code", code=code, redirect_uri=os.environ["UAEPASS_REDIRECT_URI"]))
        req = urllib.request.Request(provider() + "/token?" + query, data=b"--shelter--\r\n", headers={"Authorization": "Basic " + credentials, "Content-Type": "multipart/form-data; boundary=shelter"})
        with urllib.request.urlopen(req, timeout=15) as response:
            token = json.load(response)["access_token"]
        req = urllib.request.Request(provider() + "/userinfo", headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=15) as response:
            profile = json.load(response)
        with connection() as db:
            row = db.execute('SELECT id,name,role,case_id FROM accounts WHERE uaepass_uuid=? AND active=1', (profile.get('uuid'),)).fetchone()
        assigned = dict(zip(('id','name','role','case_id'), row)) if row else None
        if not assigned and os.getenv('SHELTER_USERS_FILE'):
            users = json.loads(Path(os.environ['SHELTER_USERS_FILE']).read_text(encoding='utf-8'))
            assigned = users.get(profile.get('uuid'))
        if not assigned or assigned.get("role") not in ROLES:
            return RedirectResponse("/?auth_error=unassigned")
        session, _ = create_session({'uuid': assigned.get('id', profile['uuid']), 'name': assigned.get('name', profile.get('fullnameEN','User')), 'role': assigned['role'], 'case_id': assigned.get('case_id')})
        response = RedirectResponse("/")
        response.delete_cookie("shelter_oauth")
        response.set_cookie("shelter_session", session, httponly=True, secure=secure_cookie(), samesite="lax", max_age=3600)
        return response
    except Exception:
        return RedirectResponse("/?auth_error=failed")

@router.get("/auth/me")
def me(request: Request):
    return identity(request)

@router.post("/auth/logout")
def logout(request: Request):
    identity(request)
    SESSIONS.pop(request.cookies.get("shelter_session"), None)
    with connection() as db:
        db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(request.cookies.get('shelter_session','').encode()).hexdigest(),))
    response = JSONResponse({"ok": True})
    response.delete_cookie("shelter_session")
    return response

def create_session(user):
    token = secrets.token_urlsafe(40)
    user = dict(user, csrf=secrets.token_urlsafe(32), expires=time.time()+3600)
    with connection() as db:
        db.execute('DELETE FROM sessions WHERE expires<?', (time.time(),))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), json.dumps(user), user['expires']))
    return token, user

class Admission(BaseModel):
    admission_ref: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=150)
    nationality: str = Field(min_length=1, max_length=80)
    language: str = Field(min_length=1, max_length=80)
    identification: str = Field(default="", max_length=150)

class Change(BaseModel):
    version: int
    kind: Literal["task", "document", "consular", "medical", "travel", "update", "depart"]
    data: dict

@router.get("/cases")
def cases(request: Request):
    user = identity(request)
    require(user,'supervisor','caseworker','medical','travel','resident')
    with connection() as db:
        rows = db.execute("SELECT body FROM cases ORDER BY rowid DESC").fetchall()
        return [project(json.loads(row[0]), user) for row in rows if user["role"] != "resident" or json.loads(row[0])["id"] == user.get("case_id")]

@router.post("/cases", status_code=201)
def admit(payload: Admission, request: Request):
    user = identity(request)
    require(user, "caseworker", "supervisor")
    data = {key: value.strip() for key, value in payload.model_dump().items()}
    if any(not data[key] for key in ("admission_ref", "name", "nationality", "language")):
        raise HTTPException(422, "Admission fields cannot be blank")
    record = dict(data, id="SH-" + secrets.token_hex(4).upper(), version=1, status="In progress", medical="", travel={"permit": "", "flight": "", "departure": "", "transfer": ""}, documents=[], consular=[], updates=[], updated=date.today().isoformat(), tasks=[dict(id=i, title=t, team=r, owner="", due="", done=False, escalated=False) for i,t,r in STEPS])
    with connection() as db:
        try:
            db.execute("INSERT INTO cases VALUES (?,?,?,?)", (record["id"], data["admission_ref"], 1, json.dumps(record)))
        except sqlite3.IntegrityError:
            raise HTTPException(409, "This admission reference already exists")
        db.execute("INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)", (user["uuid"], record["id"], "admission"))
    return project(record, user)

@router.patch("/cases/{case_id}")
def change(case_id: str, payload: Change, request: Request):
    user = identity(request)
    require(user, "caseworker", "supervisor", "medical", "travel")
    if len(json.dumps(payload.data)) > 12000:
        raise HTTPException(422, "Entry is too long")
    with connection() as db:
        record = read_case(db, case_id)
        if record["status"] == "Departed":
            raise HTTPException(409, "Departed cases are closed")
        data = payload.data
        kind = payload.kind
        if kind == "task":
            task = next((t for t in record["tasks"] if t["id"] == data.get("id")), None)
            if not task:
                raise HTTPException(422, "Unknown checklist item")
            require(user, "supervisor", task["team"])
            owner, due = str(data.get("owner", "")).strip(), str(data.get("due", ""))
            try:
                date.fromisoformat(due)
            except ValueError:
                raise HTTPException(422, "A valid deadline is required")
            if not owner or not isinstance(data.get("done"), bool) or not isinstance(data.get("escalated"), bool):
                raise HTTPException(422, "Owner and checklist status are required")
            task.update(owner=owner[:150], due=due, done=data["done"], escalated=data["escalated"])
        elif kind in {"document", "consular"}:
            require(user, "caseworker", "supervisor")
            allowed = ("name", "status", "reference") if kind == "document" else ("embassy", "status", "reference", "followup")
            entry = {key: str(data.get(key, "")).strip()[:500] for key in allowed}
            if not entry[allowed[0]] or not entry["status"]:
                raise HTTPException(422, "Name and status are required")
            collection = record["documents" if kind == "document" else "consular"]
            index = data.get("index")
            if index is None:
                collection.append(entry)
            elif isinstance(index, int) and 0 <= index < len(collection):
                collection[index] = entry
            else:
                raise HTTPException(422, "Invalid entry")
        elif kind == "medical":
            require(user, "medical", "supervisor")
            record["medical"] = str(data.get("notes", ""))[:5000]
        elif kind == "travel":
            require(user, "travel", "supervisor")
            record["travel"] = {key: str(data.get(key, ""))[:500] for key in record["travel"]}
        elif kind == "update":
            require(user, "caseworker", "supervisor")
            message = str(data.get("message", "")).strip()
            language = str(data.get("language", "")).strip()
            if not message or not language:
                raise HTTPException(422, "Message and language are required")
            record["updates"].append({"message": message[:2000], "language": language[:80], "date": date.today().isoformat()})
        elif kind == "depart":
            require(user, "supervisor", "travel")
            if not all(t["done"] for t in record["tasks"]) or not all(record["travel"].values()):
                raise HTTPException(409, "Complete all clearances and travel arrangements first")
            record["status"] = "Departed"
        record["version"] += 1
        record["updated"] = date.today().isoformat()
        result = db.execute("UPDATE cases SET body=?, version=? WHERE id=? AND version=?", (json.dumps(record), record["version"], case_id, payload.version))
        if result.rowcount != 1:
            raise HTTPException(409, "Another employee updated this case. Refresh before saving.")
        db.execute("INSERT INTO audit(actor,case_id,action) VALUES (?,?,?)", (user["uuid"], case_id, kind))
    return project(record, user)

@router.get("/cases/{case_id}/audit")
def audit(case_id: str, request: Request):
    user = identity(request)
    require(user, "supervisor")
    with connection() as db:
        return [dict(zip(("at", "actor", "action"), row)) for row in db.execute("SELECT at,actor,action FROM audit WHERE case_id=? ORDER BY id DESC", (case_id,))]
