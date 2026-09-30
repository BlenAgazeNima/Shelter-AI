import { ROLE_LABELS, ROLE_DESCRIPTIONS } from "./roles.js";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  FileText,
  MessageCircle,
  Camera,
  RefreshCw,
  Download,
} from "lucide-react";

export function PassMark({small=false}) {
  return <img className={small ? "p-pass-mark small" : "p-pass-mark"} src="/uae-pass-mark-transparent.png" alt="UAE PASS" />;
}

export function UaePassSandbox({ api, onSession, audience="employee" }) {
  const [open,setOpen]=useState(false),[step,setStep]=useState("identity"),
    [identifier,setIdentifier]=useState(()=>localStorage.getItem("shelter-test-identifier")||""),
    [remember,setRemember]=useState(false),[challenge,setChallenge]=useState(null),
    [seconds,setSeconds]=useState(0),[phone,setPhone]=useState(false),
    [error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const previous=document.body.style.overflow,htmlPrevious=document.documentElement.style.overflow;
    document.body.style.overflow="hidden";document.documentElement.style.overflow="hidden";
    const close=e=>{if(e.key==="Escape"&&!busy)setOpen(false)};
    window.addEventListener("keydown",close);
    return ()=>{document.body.style.overflow=previous;document.documentElement.style.overflow=htmlPrevious;window.removeEventListener("keydown",close)};
  },[open,busy]);
  useEffect(()=>{
    if(!challenge)return;
    const tick=()=>setSeconds(Math.max(0,Math.ceil(challenge.expires_at-Date.now()/1000)));
    tick();const timer=setInterval(tick,1000);return ()=>clearInterval(timer);
  },[challenge]);
  async function requestNumber(e){
    e?.preventDefault();setBusy(true);setError("");
    try{
      const c=await api("/auth/simulation/challenge",{method:"POST",body:JSON.stringify({identifier,audience})});
      if(remember)localStorage.setItem("shelter-test-identifier",identifier.trim());else localStorage.removeItem("shelter-test-identifier");
      setChallenge(c);setPhone(false);setStep("number");
    }catch(e){setError(e.message)}finally{setBusy(false)}
  }
  async function matchNumber(number){
    if(seconds===0){setError("This request has expired. Request a new number.");return;}
    if(number!==challenge.number){setError("That number does not match. Check the number on the login screen.");return;}
    setError("");setBusy(true);
    try{
      const user=await api("/auth/simulation/complete",{method:"POST",body:JSON.stringify({identifier,audience,challenge_id:challenge.challenge_id,selected_number:number})});
      onSession(user);setOpen(false);
    }catch(e){setError(e.message);setStep("identity")}finally{setBusy(false)}
  }
  return <>
    <button className="p-uae p-uae-button" aria-label="Sign in with UAE PASS" onClick={()=>{setOpen(true);setStep("identity");setError("")}}><PassMark small/>Sign in with UAE PASS</button>
    {audience==="employee"&&<details className="p-signin-help"><summary>Employee sign-in accounts</summary><p>Your saved account determines your name and workspace.</p><dl>{[["Shelter Manager","manager@shelter.test"],["Security Officer","security@shelter.test"],["Case Officer","case@shelter.test"],["Medical Team","medical@shelter.test"],["Travel Coordinator","travel@shelter.test"]].map(([label,id])=><div key={id}><dt>{label}</dt><dd>{id}</dd></div>)}</dl></details>}
    {open&&createPortal(<div className={"portal p-pass-screen "+(step==="identity"?"p-pass-entry":"")} role="dialog" aria-modal="true" aria-labelledby="uae-title">
      <button className="p-pass-close" onClick={()=>setOpen(false)} disabled={busy}>← Back to shelter</button>
      <div className="p-pass-content">
        <PassMark/>
        <h2 id="uae-title">{step==="identity"?"Login to UAE PASS":"Verify your login"}</h2>
        <ErrorNotice error={error}/>
        {step==="identity"?<form onSubmit={requestNumber}>
          <input className="p-pass-identifier" aria-label="Emirates ID, email, or phone" placeholder="Emirates ID, email, or phone eg. 971500000000" required maxLength={120} value={identifier} onChange={e=>setIdentifier(e.target.value)} autoFocus/>
          <label className="p-pass-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Remember me</label>
          <button className="p-pass-login" disabled={busy}>{busy?"Connecting…":"Login"}</button>
        </form>:<div>
          <p className="p-pass-instruction">Match this number in the UAE PASS approval screen.</p>
          <div className="p-pass-number" aria-label={"Verification number "+challenge.number}>{challenge.number}</div>
          <p className="p-pass-request">Login request from <strong>GDRFA Shelter Services</strong></p>
          <p className="p-pass-countdown" role="timer">{seconds>0?`Request expires in ${seconds}s`:"Request expired"}</p>
          {!phone&&seconds>0&&<button className="p-pass-login" onClick={()=>setPhone(true)}>Open approval screen</button>}
          {phone&&seconds>0&&<div className="p-pass-phone">
            <PassMark small/><h3>Authentication request</h3><p>GDRFA Shelter Services</p><p>Select the number shown on your login screen.</p>
            <div className="p-number-choices">{challenge.choices.map(n=><button key={n} disabled={busy} onClick={()=>matchNumber(n)} aria-label={"Choose number "+n}>{n}</button>)}</div>
            <button className="p-open" onClick={()=>{setStep("identity");setChallenge(null);setError("Login request cancelled.")}}>Reject request</button>
          </div>}
          {seconds===0&&<button className="p-pass-login" onClick={requestNumber} disabled={busy}>Request a new number</button>}
          <button className="p-open" onClick={()=>{setStep("identity");setChallenge(null);setError("")}}>Cancel and return</button>
        </div>}
      </div>
      <footer className="p-pass-footer"><span>UAE PASS</span><span>GDRFA Shelter Services</span><button onClick={()=>setOpen(false)}>Return to shelter login</button></footer>
    </div>,document.body)}
  </>;
}

export function ResidentLogin({api,onSession}){
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  return <div className="p-resident-login"><h3>Resident login</h3><p>No UAE PASS needed. Use the shelter reference and access code given to you by the shelter team.</p><ErrorNotice error={error}/>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");try{onSession(await api("/auth/resident",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))}))}catch(e){setError(e.message)}finally{setBusy(false)}}}>
      <Input label="Shelter reference" name="username" placeholder="e.g. SH-12345678" autoComplete="username" required maxLength={80}/>
      <Input label="Access code" name="password" type="password" autoComplete="current-password" required maxLength={200}/>
      <button className="p-primary" disabled={busy}>{busy?"Signing in…":"Open my resident portal"}</button>
    </form><p className="p-help">Need your reference or access code? Ask your case officer or shelter reception.</p></div>
}

function ResidentAccess({api,records,onCreated}){
  const [access,setAccess]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  return <section className="p-card"><h2>Resident sign-in access</h2><p>Issue a private access code linked to one resident record. Give the reference and code directly to the resident.</p><ErrorNotice error={error}/>
    <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError("");setAccess(null);try{setAccess(await api("/accounts/resident-access",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))}));await onCreated()}catch(e){setError(e.message)}finally{setBusy(false)}}}>
      <label className="p-field"><span>Resident</span><select name="case_id" required><option value="">Select resident</option>{records.map(r=><option value={r.id} key={r.id}>{r.name} · {r.id}</option>)}</select></label>
      <Input label="UAE PASS ID, email or phone (optional)" name="identifier" maxLength={120}/>
      <button className="p-primary" disabled={busy}>Issue resident access code</button>
      <button type="button" className="p-secondary" disabled={busy} onClick={async e=>{const values=Object.fromEntries(new FormData(e.currentTarget.form));setBusy(true);setError("");try{await api("/accounts/resident-link",{method:"POST",body:JSON.stringify(values)});setAccess({linked:true});await onCreated()}catch(e){setError(e.message)}finally{setBusy(false)}}}>Link UAE PASS only</button>
    </form>{access?.linked?<div className="p-notice" role="status">UAE PASS identifier linked to this resident.</div>:access&&<div className="p-notice" role="status"><strong>{access.name}</strong><p>Shelter reference: <b>{access.reference}</b></p><p>Access code: <code>{access.access_code}</code></p><small>Save this code now. It will not be displayed again after leaving this page.</small></div>}
  </section>
}

function ErrorNotice({ error }) {
  return error ? (
    <div className="p-error" role="alert">
      {error}
    </div>
  ) : null;
}
function Input({ label, ...props }) {
  return (
    <label className="p-field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

export function AccountSettings({ api, onSession, user }) {
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  if (user?.simulation)
    return (
      <section className="p-card">
        <h2>Your sign-in profile</h2>
        <p>
          Signed in as {user.name}. Your current workspace is {ROLE_LABELS[user.role]}.
        </p>
        <p>Sign out to use a different shelter profile.</p>
      </section>
    );
  return (
    <section className="p-card">
      <h2>Account security</h2>
      <p>
        Change the password for your shelter account. UAE PASS credentials are
        managed by UAE PASS.
      </p>
      <ErrorNotice error={error} />
      {notice && (
        <div role="status" className="p-notice">
          {notice}
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget,
            data = Object.fromEntries(new FormData(form));
          if (data.replacement !== data.confirm) {
            setError("New passwords do not match.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            const user = await api("/auth/change-password", {
              method: "POST",
              body: JSON.stringify(data),
            });
            onSession(user);
            form.reset();
            setNotice("Password changed. Other sessions have been signed out.");
          } catch (err) {
            setError(err.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="p-fields">
          <Input
            label="Current password"
            name="current"
            type="password"
            autoComplete="current-password"
            required
          />
          <Input
            label="New password"
            name="replacement"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm new password"
            name="confirm"
            type="password"
            minLength={12}
            autoComplete="new-password"
            required
          />
        </div>
        <button className="p-primary" disabled={busy}>
          Change password
        </button>
      </form>
    </section>
  );
}

export function Accounts({ api, records, user }) {
  const [accounts, setAccounts] = useState([]),
    [role, setRole] = useState("caseworker"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setAccounts(await api("/accounts"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="p-title">
        <div>
          <p className="p-eyebrow">ACCESS MANAGEMENT</p>
          <h1>People & permissions</h1>
          <p>Create employee access or link a resident to their own record.</p>
        </div>
      </div>
      <ErrorNotice error={error} />
      {notice && (
        <div className="p-notice" role="status">
          {notice}
        </div>
      )}
      <ResidentAccess api={api} records={records} onCreated={load} />
      <section className="p-card">
        <h2>
          <Users size={20} /> Create an account
        </h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            setError("");
            try {
              await api("/accounts", {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              });
              form.reset();
              setRole("caseworker");
              setNotice(
                "Account created. Share the username and initial password securely with its owner.",
              );
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="p-fields">
            <Input label="Full name" name="name" required maxLength={150} />
            <Input
              label="Username"
              name="username"
              required
              minLength={3}
              maxLength={80}
              autoComplete="off"
            />
            <Input
              label="Initial password (12+ characters)"
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
            />
            <label className="p-field">
              <span>Role</span>
              <select
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {[
                  "caseworker",
                  "medical",
                  "travel",
                  "supervisor",
                  "security",
                  "resident",
                ].map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>
            </label>
            {role === "resident" && (
              <label className="p-field">
                <span>Resident record</span>
                <select name="case_id" required>
                  <option value="">Select a resident</option>
                  {records.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Input
              label="UAE PASS ID, email or phone (optional)"
              name="identifier"
              maxLength={150}
            />
          </div>
          <button className="p-primary" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      </section>
      <section className="p-card">
        <h2>Authorized users</h2>
        <div className="p-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name / username</th>
                <th>Role</th>
                <th>Linked record</th>
                <th>Access</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                    <small>{a.username}</small>
                  </td>
                  <td>{ROLE_LABELS[a.role] || a.role}</td>
                  <td>{a.case_id || "Employee"}</td>
                  <td>{a.active ? "Active" : "Disabled"}</td>
                  <td>
                    <button
                      className="p-secondary"
                      disabled={a.id === user.uuid || busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await api("/accounts/" + a.id, {
                            method: "PATCH",
                            body: JSON.stringify({ active: !a.active }),
                          });
                          await load();
                        } catch (e) {
                          setError(e.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {a.active ? "Disable" : "Enable"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function CaseFiles({ record, user, api }) {
  const [files, setFiles] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const canUpload =
    ["supervisor", "caseworker", "resident"].includes(user.role) &&
    record.status !== "Departed";
  async function load() {
    try {
      setFiles(await api("/cases/" + record.id + "/files"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [record.id]);
  return (
    <section className="p-card">
      <h2>
        <FileText size={20} /> Case documents
      </h2>
      <ErrorNotice error={error} />
      {canUpload && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const file = form.elements.document.files[0];
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              if (file.size > 10 * 1024 * 1024)
                throw new Error("Choose a file smaller than 10 MB.");
              const response = await fetch(
                "/api/cases/" +
                  record.id +
                  "/files?filename=" +
                  encodeURIComponent(file.name),
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/octet-stream",
                    "X-CSRF-Token": user.csrf,
                  },
                  body: file,
                },
              );
              const data = await response.json();
              if (!response.ok)
                throw new Error(data.detail || "Upload failed.");
              form.reset();
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="p-field">
            <span>PDF, PNG or JPEG · Maximum 10 MB</span>
            <input
              type="file"
              name="document"
              accept=".pdf,.png,.jpg,.jpeg"
              required
            />
          </label>
          <button
            className="p-primary"
            style={{ marginTop: 14 }}
            disabled={busy}
          >
            {busy ? "Uploading…" : "Upload document"}
          </button>
        </form>
      )}
      {files.map((f) => (
        <div className="p-fact" key={f.id}>
          <span>
            {f.name}
            <small style={{ display: "block" }}>
              {Math.ceil(f.size / 1024)} KB · {f.created}
            </small>
          </span>
          <a
            className="p-open"
            href={"/api/cases/" + record.id + "/files/" + f.id}
            download
          >
            <Download size={16} /> Download
          </a>
        </div>
      ))}
      {files.length === 0 && <p>No documents uploaded yet.</p>}
    </section>
  );
}

export function CaseMessages({ record, user, api }) {
  const [messages, setMessages] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setMessages(await api("/cases/" + record.id + "/messages"));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [record.id]);
  return (
    <section className="p-card">
      <h2>
        <MessageCircle size={20} />{" "}
        {user.role === "resident"
          ? "Contact your case officer"
          : "Resident conversation"}
      </h2>
      <p>
        Messages are shared between the resident and their case support team.
      </p>
      <ErrorNotice error={error} />
      {messages.length === 0 && <p>No messages yet.</p>}
      {messages.map((m) => (
        <article className="p-update" key={m.id}>
          <small>
            {m.sender} · {m.sender_role} · {m.created}
          </small>
          <p>{m.message}</p>
        </article>
      ))}
      {record.status !== "Departed" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            setError("");
            try {
              await api("/cases/" + record.id + "/messages", {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              });
              form.reset();
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="p-field">
            <span>Your message</span>
            <textarea name="message" required maxLength={2000} rows={3} />
          </label>
          <button
            className="p-primary"
            style={{ marginTop: 14 }}
            disabled={busy}
          >
            {busy ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </section>
  );
}

export function Monitoring({ api, user }) {
  const [analysis, setAnalysis] = useState(true);
  const [frameTick, setFrameTick] = useState(0);
  const [feeds, setFeeds] = useState([]),
    [alerts, setAlerts] = useState([]),
    [incidents, setIncidents] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(null);
  async function load() {
    try {
      const [f, a, i] = await Promise.all([
        api("/cameras"),
        api("/alerts?limit=200"),
        api("/incidents?limit=200"),
      ]);
      setFeeds(f);
      setAlerts(a);
      setIncidents(i);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    const frames = setInterval(() => setFrameTick(Date.now()), 1000);
    return () => { clearInterval(timer); clearInterval(frames); };
  }, []);
  return (
    <>
      <div className="p-title">
        <div>
          <p className="p-eyebrow">SAFETY OPERATIONS</p>
          <h1>Video & incident review</h1>
          <p>
            Review available recordings and record the actions your team takes.
          </p>
        </div>
        <button className="p-secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      <ErrorNotice error={error} />
      <div className="p-notice">
        <label><input type="checkbox" checked={analysis} onChange={e => setAnalysis(e.target.checked)} /> Show YOLO detection on recordings</label>
        <p>Boxes and counts come from person detection. Safety alerts are possible concerns for officer review. Turn this off to pause or seek the original recording.</p>
      </div>
      {notice && (
        <div className="p-notice" role="status">
          {notice}
        </div>
      )}
      <div className="p-video-grid">
        {feeds.map((f) => (
          <section className="p-card" key={f.camera_id}>
            <div className="p-section-title">
              <h2>
                <Camera size={19} />
                {f.name}
              </h2>
              <span className="p-pill">Recorded video</span>
            </div>
            {analysis && f.analysis_url ? (
              <>
                <p role="status">{f.ai_status} · {f.people} people · {f.fps} analysis fps</p>
                {f.frame_number > 0 ? <img className="p-analysis-frame" src={f.analysis_url + "?t=" + frameTick} alt={f.name + " — YOLO detection"} /> : <p>Starting analysis…</p>}
                <p>{f.last_event}</p>
              </>
            ) : f.status !== "Unavailable" ? (
              <video
                controls
                preload="metadata"
                playsInline
                src={f.video_url || "/api/media/" + f.camera_id}
                aria-label={f.name}
                onError={() =>
                  setError(
                    "A recording could not be played. Refresh the page or check the video file.",
                  )
                }
              />
            ) : (
              <p>Recording unavailable.</p>
            )}
            <p>
              {f.location} · {analysis && f.analysis_url ? "YOLO analysis of recorded footage" : "Original recording · pause, seek and full screen"}
            </p>
            {analysis && !f.analysis_url && <p>YOLO is disabled. Run SETUP_AI.bat, then restart the backend.</p>}
          </section>
        ))}
      </div>
      <section className="p-card">
        <h2>Record a safety concern</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            setError("");
            try {
              await api("/safety-reports", {
                method: "POST",
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              });
              form.reset();
              setNotice("Safety report saved to the review queue.");
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="p-fields">
            <label className="p-field">
              <span>Location / recording</span>
              <select name="camera_id" required>
                {feeds.map((f) => (
                  <option value={f.camera_id} key={f.camera_id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="p-field">
              <span>Severity</span>
              <select name="severity">
                {["Low", "Medium", "High", "Critical"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <Input label="Concern" name="title" maxLength={150} required />
            <label className="p-field">
              <span>Observation and recording timestamp</span>
              <textarea name="details" required maxLength={2000} rows={3} />
            </label>
          </div>
          <button className="p-primary" disabled={busy}>
            Save safety report
          </button>
        </form>
      </section>
      <section className="p-card">
        <h2>Review queue & history</h2>
        {alerts.length === 0 && <p>No safety concerns recorded.</p>}
        {alerts.map((a) => (
          <div className="p-queue" key={a.id}>
            <span>
              <b>{a.title}</b>
              <small>
                {a.camera_id} · {a.severity} · {a.status}
              </small>
              <small>{a.details}</small>
            </span>
            {["Open", "Under Review"].includes(a.status) && (
              <button
                className="p-secondary"
                onClick={() => setReview({ type: "alert", item: a })}
              >
                Review
              </button>
            )}
          </div>
        ))}
      </section>
      <section className="p-card">
        <h2>Verified incidents</h2>
        {!incidents.length && <p>No verified incidents.</p>}
        {incidents.map((i) => (
          <div className="p-queue" key={i.id}>
            <span>
              <b>{i.title}</b>
              <small>
                {i.category} · {i.status} · {i.action_taken}
              </small>
            </span>
            {i.status !== "Resolved" && (
              <button
                className="p-secondary"
                onClick={() => setReview({ type: "incident", item: i })}
              >
                Resolve
              </button>
            )}
          </div>
        ))}
      </section>
      {review && (
        <div className="p-dialog-backdrop" role="presentation">
          <section
            className="p-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
          >
            <h2 id="review-title">
              {review.type === "incident"
                ? "Resolve incident"
                : "Review concern"}
              : {review.item.title}
            </h2>
            <ErrorNotice error={error} />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const data = Object.fromEntries(new FormData(e.currentTarget));
                setBusy(true);
                setError("");
                try {
                  if (review.type === "incident")
                    await api("/incidents/" + review.item.id + "/resolve", {
                      method: "POST",
                      body: JSON.stringify({
                        officer: user.name,
                        resolution_note: data.note,
                      }),
                    });
                  else if (data.outcome === "Dismiss")
                    await api("/alerts/" + review.item.id + "/dismiss", {
                      method: "POST",
                      body: JSON.stringify({
                        officer: user.name,
                        reason: data.note,
                        note: data.note,
                      }),
                    });
                  else
                    await api("/alerts/" + review.item.id + "/verify", {
                      method: "POST",
                      body: JSON.stringify({
                        officer: user.name,
                        category: data.category,
                        action_taken: data.note,
                        note: data.note,
                      }),
                    });
                  setReview(null);
                  setNotice("Review saved.");
                  await load();
                } catch (err) {
                  setError(err.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="p-fields">
                {review.type === "alert" && (
                  <>
                    <label className="p-field">
                      <span>Outcome</span>
                      <select name="outcome">
                        <option>Verify</option>
                        <option>Dismiss</option>
                      </select>
                    </label>
                    <Input
                      label="Incident category"
                      name="category"
                      defaultValue="Safety concern"
                      required
                    />
                  </>
                )}
                <label className="p-field">
                  <span>
                    {review.type === "incident"
                      ? "Resolution and action taken"
                      : "Action taken / reason for decision"}
                  </span>
                  <textarea name="note" required maxLength={200} rows={4} />
                </label>
              </div>
              <div className="p-actions">
                <button className="p-primary" disabled={busy}>
                  Save decision
                </button>
                <button
                  type="button"
                  className="p-secondary"
                  onClick={() => {
                    setReview(null);
                    setError("");
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
