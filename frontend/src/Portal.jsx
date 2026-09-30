import { TeamHome, SecurityWorkspace } from "./RoleWorkspaces.jsx";
import {
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  DEFAULT_TABS,
  ROLE_TABS,
} from "./roles.js";
import React, { useEffect, useState } from "react";
import {
  Users,
  ShieldCheck,
  ArrowRight,
  FileText,
  Plane,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Plus,
  Search,
  Clock,
  Globe,
  HeartPulse,
  ChevronLeft,
  Bell,
} from "lucide-react";
import {
  UaePassSandbox,
  PassMark,
  ResidentLogin,
  Monitoring,
  Accounts,
  AccountSettings,
  CaseFiles,
  CaseMessages,
} from "./ServicePanels.jsx";
import "./portal.css";

function Field({ label, children, ...props }) {
  return (
    <label className="p-field">
      <span>{label}</span>
      {children || <input {...props} />}
    </label>
  );
}
function Pill({ children, good = false }) {
  return <span className={`p-pill ${good ? "good" : ""}`}>{children}</span>;
}
function Stat({ icon: Icon, label, value }) {
  return (
    <div className="p-stat">
      <Icon size={21} />
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}
function Form({ onSubmit, children, button = "Save changes", busy = false }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
      }}
    >
      <div className="p-fields">{children}</div>
      <button className="p-primary" disabled={busy}>
        {busy ? "Saving…" : button}
      </button>
    </form>
  );
}
function Resident({ record }) {
  const [language, setLanguage] = useState(record.language);
  const ar = language === "العربية";
  const updates = record.updates.filter((u) => u.language === language);
  return (
    <div className="p-resident" dir={ar ? "rtl" : "ltr"}>
      <div className="p-title">
        <div>
          <p className="p-eyebrow">
            {ar ? "خدمات المقيمين" : "RESIDENT SERVICES"}
          </p>
          <h1>
            {ar ? "رحلتك، خطوة بخطوة" : "Your journey, one step at a time"}
          </h1>
          <p>
            {ar
              ? "تابع آخر المستجدات والخطوات القادمة."
              : "See your latest updates and what happens next."}
          </p>
        </div>
        <Field label={ar ? "اللغة" : "Language"}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {[
              ...new Set([
                "English",
                "العربية",
                record.language,
                ...record.updates.map((u) => u.language),
              ]),
            ].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>
      </div>
      <section className="p-welcome">
        <Globe size={36} />
        <div>
          <h2>{record.name}</h2>
          <p>
            {record.id} · {ar ? "ملف المقيم" : "Your resident record"}
          </p>
        </div>
        <Pill>
          {record.status === "Departed"
            ? ar
              ? "تمت المغادرة"
              : "Departed"
            : ar
              ? "قيد المتابعة"
              : "In progress"}
        </Pill>
      </section>
      <div className="p-two">
        <section className="p-card">
          <h2>
            <Bell size={20} />
            {ar ? "آخر المستجدات" : "Your latest updates"}
          </h2>
          {updates.length ? (
            updates
              .slice()
              .reverse()
              .map((u, i) => (
                <article className="p-update" key={i}>
                  <small>
                    {u.date} · {u.language}
                  </small>
                  <p>{u.message}</p>
                </article>
              ))
          ) : (
            <p>
              {ar
                ? "لا توجد مستجدات بهذه اللغة بعد. يرجى طلب المساعدة من موظف الحالة."
                : "No updates in this language yet. Ask your case officer for assistance."}
            </p>
          )}
        </section>
        <section className="p-card">
          <h2>
            <Plane size={20} />
            {ar ? "ترتيبات السفر" : "Travel arrangements"}
          </h2>
          {Object.entries(record.travel).map(([key, value]) => (
            <div className="p-fact" key={key}>
              <span>
                {
                  {
                    permit: ar ? "تصريح الخروج" : "Exit permit",
                    flight: ar ? "الرحلة" : "Flight",
                    departure: ar ? "موعد المغادرة" : "Departure",
                    transfer: ar ? "النقل إلى المطار" : "Airport transfer",
                  }[key]
                }
              </span>
              <strong>
                {value || (ar ? "بانتظار التأكيد" : "Awaiting confirmation")}
              </strong>
            </div>
          ))}
          <p className="p-help">
            {ar
              ? "سيؤكد الموظفون ترتيبات سفرك والخطوة التالية."
              : "Staff will confirm your travel arrangements and next step with you."}
          </p>
        </section>
      </div>
      <section className="p-card">
        <h2>{ar ? "تحتاج إلى مساعدة؟" : "Need help?"}</h2>
        <p>
          {ar
            ? "تواصل مع موظف الحالة للحصول على المساعدة أو طلب مترجم."
            : "Speak to your case officer for assistance or to request an interpreter."}
        </p>
      </section>
    </div>
  );
}

export default function Portal() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [configured, setConfigured] = useState(false),
    [setupRequired, setSetupRequired] = useState(false),
    [simulation, setSimulation] = useState(false),
    [audience,setAudience] = useState(null),
    [backendAvailable, setBackendAvailable] = useState(true),
    [records, setRecords] = useState([]),
    [page, setPage] = useState("overview"),
    [selected, setSelected] = useState(null),
    [tab, setTab] = useState("overview"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [admission, setAdmission] = useState(false),
    [audit, setAudit] = useState([]);
  async function api(path, options = {}) {
    const response = await fetch("/api" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": user?.csrf || "",
        ...options.headers,
      },
    });
    const data = await response.json();
    if (response.status === 401 && user) {
      setUser(null);
      setRecords([]);
      setSelected(null);
    }
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Please check the fields and try again.",
      );
    return data;
  }
  useEffect(() => {
    Promise.allSettled([
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/auth/config").then((r) => (r.ok ? r.json() : {})),
    ]).then(([u, c]) => {
      if (u.status === "fulfilled") setUser(u.value);
      if (
        c.status === "fulfilled" &&
        typeof c.value.setup_required === "boolean"
      ) {
        setConfigured(!!c.value.configured);
        setSimulation(!!c.value.simulation);
        setSetupRequired(c.value.setup_required);
      } else {
        setBackendAvailable(false);
        setError(
          "The service is unavailable. Start the backend and reload this page.",
        );
      }
      setLoading(false);
    });
    const reason = new URLSearchParams(location.search).get("auth_error");
    if (reason)
      setError(
        {
          unassigned:
            "Your identity is verified but no shelter access has been assigned. Contact the shelter administrator.",
          cancelled: "Sign-in was cancelled. You can try again.",
          failed: "UAE PASS sign-in could not be completed. Please try again.",
        }[reason] || "Sign-in failed.",
      );
  }, []);
  async function refresh() {
    try {
      if (user?.role !== "security") setRecords(await api("/cases"));
      setError("");
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    if (user) {
      refresh();
      const timer = setInterval(refresh, 30000);
      return () => clearInterval(timer);
    }
  }, [user]);
  const record = records.find((r) => r.id === selected),
    isResident = user?.role === "resident";
  const allowed = (...roles) =>
    user?.role === "supervisor" || roles.includes(user?.role);
  const overdue = (t) =>
    !t.done && t.due && t.due < new Date().toISOString().slice(0, 10);
  const ready = (r) =>
    r.tasks?.every((t) => t.done) && Object.values(r.travel).every(Boolean);
  const active = records.filter((r) => r.status !== "Departed");
  const shown = records.filter(
    (r) =>
      (filter === "All" ||
        (filter === "Ready"
          ? ready(r) && r.status !== "Departed"
          : filter === "Overdue"
            ? r.status !== "Departed" && r.tasks?.some(overdue)
            : r.status === filter)) &&
      [r.name, r.id, r.nationality, r.admission_ref]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  async function signIn(data) {
    setBusy(true);
    setError("");
    try {
      const u = await api(setupRequired ? "/auth/setup" : "/auth/password", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setUser(u);
      setSetupRequired(false);
      setPage("overview");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
      setUser(null);
      setRecords([]);
      setSelected(null);
      setNotice("");
      setError("");
      setPage("overview");
    } catch (e) {
      setError(e.message);
    }
  }
  async function save(kind, data) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const updated = await api("/cases/" + record.id, {
        method: "PATCH",
        body: JSON.stringify({ kind, data, version: record.version }),
      });
      setRecords((rows) =>
        rows.map((r) => (r.id === updated.id ? updated : r)),
      );
      setNotice("Changes saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function create(data) {
    setBusy(true);
    setError("");
    try {
      if (
        Object.values(data)
          .slice(0, 4)
          .some((v) => !v.trim())
      )
        throw new Error("Complete the admission details.");
      if (records.some((r) => r.admission_ref === data.admission_ref.trim()))
        throw new Error("This admission reference already exists.");
      const r = await api("/cases", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setRecords((rows) => [r, ...rows]);
      setSelected(r.id);
      setTab("overview");
      setAdmission(false);
      setPage("cases");
      setNotice(
        "Resident admitted. Assign the checklist owners and deadlines.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const accountSignInForm = (
    <Form
      onSubmit={signIn}
      busy={busy || !backendAvailable}
      button={setupRequired ? "Create administrator account" : "Sign in"}
    >
      {setupRequired && (
        <Field label="Your full name" name="name" required maxLength={150} />
      )}
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        minLength={3}
        maxLength={80}
        required
      />
      <Field
        label={setupRequired ? "Password (at least 12 characters)" : "Password"}
        name="password"
        type="password"
        autoComplete={setupRequired ? "new-password" : "current-password"}
        minLength={setupRequired ? 12 : 1}
        maxLength={200}
        required
      />
    </Form>
  );
  const header = (
    <>
      <div className="p-government">
        <span>United Arab Emirates Government</span>
        <span>الإدارة العامة للإقامة وشؤون الأجانب – دبي</span>
      </div>
      <header className="p-header">
        <img src="/gdrfa-logo.png" alt="GDRFA Dubai" />
        <div className="p-brand">
          <strong>Shelter services</strong>
          <span>Care. Coordination. Safe departure.</span>
        </div>
        {user && (
          <div className="p-account">
            <span>
              {user.name}
              <small>
                {isResident
                  ? "Resident portal"
                  : `${ROLE_LABELS[user.role]} workspace`}
              </small>
            </span>
            <button
              className="p-secondary"
              onClick={() =>
                setPage(page === "profile" ? "overview" : "profile")
              }
            >
              {page === "profile" ? "Back" : "My account"}
            </button>
            <button className="p-icon" aria-label="Sign out" onClick={signOut}>
              <LogOut size={19} />
            </button>
          </div>
        )}
      </header>
    </>
  );
  if (loading)
    return (
      <div className="portal">
        {header}
        <main className="p-loading">Loading shelter services…</main>
      </div>
    );
  if (!user)
    return (
      <div className="portal">
        {header}
        <main className="p-landing">
          <section className="p-intro">
            <p className="p-eyebrow">GDRFA DUBAI · SHELTER SERVICES</p>
            <h1>
              One connected journey.
              <br />
              <em>Care at every step.</em>
            </h1>
            <p>
              From arrival to safe departure, a shared record keeps support,
              documents and travel arrangements moving together.
            </p>
            <div className="p-intro-points">
              <span>
                <ShieldCheck />
                Role-based access
              </span>
              <span>
                <Globe />
                Clear resident updates
              </span>
              <span>
                <ClipboardList />
                Coordinated casework
              </span>
            </div>
            <div className="p-journey">
              <span>
                01
                <br />
                <b>Welcome & register</b>
              </span>
              <ArrowRight />
              <span>
                02
                <br />
                <b>Support & prepare</b>
              </span>
              <ArrowRight />
              <span>
                03
                <br />
                <b>Ready to depart</b>
              </span>
            </div>
          </section>
          <section className="p-login">
            <p className="p-eyebrow">WELCOME TO SHELTER SERVICES</p>
            <h2>
              {setupRequired
                ? "Set up shelter services"
                : simulation
                  ? "Continue to shelter services"
                  : "Sign in to your account"}
            </h2>
            <p>
              {setupRequired
                ? "Create the first administrator account to begin managing residents, employees and shelter operations."
                : "Your assigned role opens your employee workspace or personal resident portal."}
            </p>
            {error && (
              <div className="p-error" role="alert">
                {error}
              </div>
            )}
            {!setupRequired && <div className="p-audience-picker" aria-label="Choose your portal">
              <button className={audience==="resident"?"selected":""} onClick={()=>{setAudience("resident");setError("")}}><Users size={24}/><strong>Resident</strong><span>My updates, documents &amp; travel</span></button>
              <button className={audience==="employee"?"selected":""} onClick={()=>{setAudience("employee");setError("")}}><ShieldCheck size={24}/><strong>Employee</strong><span>Shelter operations &amp; casework</span></button>
            </div>}
            {audience==="resident" && <>
              <ResidentLogin api={api} onSession={u=>{setUser(u);setPage("overview");setError("");setSelected(null)}}/>
              <div className="p-signin-divider">or sign in with your digital identity</div>
            </>}
            {(audience || setupRequired) && <>
              {simulation ? <>
                <UaePassSandbox key={audience} audience={audience} api={api} onSession={u=>{setUser(u);setPage("overview");setError("");setSelected(null)}}/>
                {audience==="employee"&&<details className="p-account-alternative"><summary>Employee login with username &amp; password</summary>{accountSignInForm}</details>}
              </> : <>
                {(audience==="employee"||setupRequired)&&accountSignInForm}
                {!setupRequired&&<a className={`p-uae ${!configured?"disabled":""}`} href={configured?"/api/auth/login":undefined} aria-disabled={!configured} onClick={()=>{if(!configured)setError("UAE PASS is not connected. Please use your shelter account.")}}><PassMark small/>Sign in with UAE PASS</a>}
              </>}
            </>}

          </section>
        </main>
        <footer className="p-footer">
          GDRFA Dubai · Shelter services platform
        </footer>
      </div>
    );
  return (
    <div className="portal">
      {header}
      {error && (
        <div className="p-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-notice" role="status">
          {notice}
        </div>
      )}
      {user.role === "security" ? (
        <SecurityWorkspace
          user={user}
          api={api}
          onSession={setUser}
          profile={page === "profile"}
        />
      ) : isResident ? (
        <main className="p-content">
          {records.find((r) => r.id === user.case_id) ? (
            <>
              {page === "profile" ? (
                <AccountSettings api={api} onSession={setUser} user={user} />
              ) : (
                <>
                  <Resident
                    record={records.find((r) => r.id === user.case_id)}
                  />
                  <CaseFiles
                    record={records.find((r) => r.id === user.case_id)}
                    user={user}
                    api={api}
                  />
                  <CaseMessages
                    record={records.find((r) => r.id === user.case_id)}
                    user={user}
                    api={api}
                  />
                </>
              )}
            </>
          ) : (
            <section className="p-card">
              <h2>Your case is not linked yet</h2>
              <p>
                Please speak to a case officer to connect your resident record.
              </p>
            </section>
          )}
        </main>
      ) : (
        <div className="p-shell">
          <aside className="p-sidebar">
            <p>{ROLE_LABELS[user.role].toUpperCase()} WORKSPACE</p>
            {[
              [
                "overview",
                user.role === "supervisor"
                  ? "Shelter overview"
                  : `${ROLE_LABELS[user.role]} home`,
                LayoutDashboard,
              ],
              ...(user.role !== "travel"
                ? [
                    [
                      "cases",
                      user.role === "medical"
                        ? "Medical records"
                        : "Resident records",
                      Users,
                    ],
                  ]
                : []),
              [
                "tasks",
                user.role === "supervisor"
                  ? "All team checklists"
                  : "My team checklist",
                ClipboardList,
              ],
              ...(["supervisor", "travel"].includes(user.role)
                ? [["departures", "Departures", Plane]]
                : []),
              ...(user.role === "supervisor"
                ? [
                    ["monitoring", "Safety & monitoring", HeartPulse],
                    ["accounts", "People & permissions", ShieldCheck],
                  ]
                : []),
            ].map(([id, label, Icon]) => (
              <button
                className={page === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setPage(id);
                  setSelected(null);
                  setAdmission(false);
                  setNotice("");
                }}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
            <div className="p-sidebar-note">
              <ShieldCheck />
              <b>One resident. One record.</b>
              <span>Access follows your assigned responsibilities.</span>
            </div>
          </aside>
          <main className="p-content">
            {page === "monitoring" ? (
              <>
                <button
                  className="p-secondary"
                  onClick={() => setPage("overview")}
                >
                  Back to case operations
                </button>
                <Monitoring api={api} user={user} />
              </>
            ) : page === "overview" && user.role !== "supervisor" ? (
              <TeamHome
                user={user}
                records={records}
                onOpen={(r, t) => {
                  setSelected(r.id);
                  setTab(t);
                  setPage(user.role === "travel" ? "departures" : "cases");
                }}
              />
            ) : page === "accounts" ? (
              <Accounts api={api} records={records} user={user} />
            ) : page === "profile" ? (
              <AccountSettings api={api} onSession={setUser} user={user} />
            ) : (
              <>
                <div className="p-title">
                  <div>
                    <p className="p-eyebrow">
                      {ROLE_LABELS[user.role].toUpperCase()} WORKSPACE
                    </p>
                    <h1>
                      {record
                        ? record.name
                        : {
                            overview: "Shelter manager overview",
                            cases: "Resident records",
                            tasks: "Work together. Keep things moving.",
                            departures: "Departure readiness",
                          }[page]}
                    </h1>
                    <p>
                      {record
                        ? `${record.id} · ${record.nationality} · ${record.language}`
                        : "From arrival to departure, one coordinated view of care."}
                    </p>
                  </div>
                  <div className="p-actions">
                    {user && (
                      <button className="p-secondary" onClick={refresh}>
                        Refresh
                      </button>
                    )}
                    {allowed("caseworker") && (
                      <button
                        className="p-primary"
                        onClick={() => {
                          setAdmission(true);
                          setSelected(null);
                        }}
                      >
                        <Plus size={17} /> New admission
                      </button>
                    )}
                  </div>
                </div>
                {admission ? (
                  <section className="p-card">
                    <div className="p-section-title">
                      <h2>Register a resident</h2>
                      <button
                        className="p-secondary"
                        onClick={() => setAdmission(false)}
                      >
                        Cancel
                      </button>
                    </div>
                    <p>
                      Use a unique admission reference to avoid duplicate
                      registration.
                    </p>
                    <Form
                      busy={busy}
                      onSubmit={create}
                      button="Create resident record"
                    >
                      <Field
                        label="Admission reference"
                        name="admission_ref"
                        required
                        maxLength={80}
                      />
                      <Field
                        label="Resident name"
                        name="name"
                        required
                        maxLength={150}
                      />
                      <Field
                        label="Nationality"
                        name="nationality"
                        required
                        maxLength={80}
                      />
                      <Field
                        label="Preferred language"
                        name="language"
                        required
                        maxLength={80}
                        defaultValue="English"
                      />
                      <Field
                        label="Available identification (optional)"
                        name="identification"
                        maxLength={150}
                      />
                    </Form>
                  </section>
                ) : record ? (
                  <>
                    <button
                      className="p-back"
                      onClick={() => setSelected(null)}
                    >
                      <ChevronLeft size={16} /> All residents
                    </button>
                    <div className="p-record-meta">
                      <Pill good={record.status === "Departed"}>
                        {record.status}
                      </Pill>
                      <span>Admission {record.admission_ref}</span>
                      <span>Updated {record.updated}</span>
                      <span>
                        {record.tasks.filter((t) => t.done).length} / 8 checks
                        complete
                      </span>
                    </div>
                    <div className="p-tabs">
                      {(ROLE_TABS[user.role] || []).map((t) => (
                        <button
                          key={t}
                          className={tab === t ? "active" : ""}
                          onClick={async () => {
                            setTab(t);
                            if (t === "audit") {
                              try {
                                setAudit(
                                  await api("/cases/" + record.id + "/audit"),
                                );
                              } catch (e) {
                                setError(e.message);
                              }
                            }
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <fieldset
                      className="p-edit-region"
                      disabled={busy || record.status === "Departed"}
                    >
                      {tab === "files" && (
                        <CaseFiles record={record} user={user} api={api} />
                      )}
                      {tab === "messages" && (
                        <CaseMessages record={record} user={user} api={api} />
                      )}
                      {tab === "overview" && (
                        <div className="p-two">
                          <section className="p-card">
                            <h2>
                              <FileText size={20} /> Resident information
                            </h2>
                            {[
                              ["Name", record.name],
                              ["Nationality", record.nationality],
                              ["Preferred language", record.language],
                              [
                                "Identification",
                                record.identification || "Not available",
                              ],
                              ["Admission reference", record.admission_ref],
                            ].map(([a, b]) => (
                              <div className="p-fact" key={a}>
                                <span>{a}</span>
                                <strong>{b}</strong>
                              </div>
                            ))}
                          </section>
                          <section className="p-card">
                            <h2>
                              <ClipboardList size={20} /> Case progress
                            </h2>
                            <div className="p-progress">
                              <span
                                style={{
                                  width: `${(record.tasks.filter((t) => t.done).length / 8) * 100}%`,
                                }}
                              />
                            </div>
                            <p>
                              {record.tasks.filter((t) => t.done).length} of 8
                              readiness checks complete
                            </p>
                            {record.tasks
                              .filter(
                                (t) =>
                                  !t.done &&
                                  (user.role === "supervisor" ||
                                    t.team === user.role),
                              )
                              .map((t) => (
                                <div className="p-fact" key={t.id}>
                                  <span>{t.title}</span>
                                  <strong>
                                    {t.owner || "Assign owner"}{" "}
                                    {overdue(t) ? "· Overdue" : ""}
                                  </strong>
                                </div>
                              ))}
                          </section>
                        </div>
                      )}
                      {tab === "checklist" && (
                        <section className="p-card">
                          <h2>Parallel case checklist</h2>
                          <p>
                            Teams can progress independently. Overdue work
                            appears in the operations queue; flag escalation for
                            supervisor attention.
                          </p>
                          {record.tasks
                            .filter(
                              (t) =>
                                user.role === "supervisor" ||
                                t.team === user.role,
                            )
                            .map((t) => (
                              <form
                                className="p-task-edit"
                                key={`${record.id}-${t.id}-${record.version}`}
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const d = new FormData(e.currentTarget);
                                  save("task", {
                                    id: t.id,
                                    owner: d.get("owner"),
                                    due: d.get("due"),
                                    done: d.has("done"),
                                    escalated: d.has("escalated"),
                                  });
                                }}
                              >
                                <div>
                                  <strong>{t.title}</strong>
                                  <small>
                                    {t.team} {overdue(t) ? "· Overdue" : ""}
                                  </small>
                                </div>
                                <Field
                                  label="Owner"
                                  name="owner"
                                  required
                                  defaultValue={t.owner}
                                  disabled={!allowed(t.team)}
                                />
                                <Field
                                  label="Deadline"
                                  name="due"
                                  type="date"
                                  required
                                  defaultValue={t.due}
                                  disabled={!allowed(t.team)}
                                />
                                <label>
                                  <input
                                    type="checkbox"
                                    name="done"
                                    defaultChecked={t.done}
                                    disabled={!allowed(t.team)}
                                  />{" "}
                                  Complete
                                </label>
                                <label>
                                  <input
                                    type="checkbox"
                                    name="escalated"
                                    defaultChecked={t.escalated}
                                    disabled={!allowed(t.team)}
                                  />{" "}
                                  Escalate
                                </label>
                                <button
                                  className="p-secondary"
                                  disabled={!allowed(t.team)}
                                >
                                  Save
                                </button>
                              </form>
                            ))}
                        </section>
                      )}
                      {(tab === "documents" || tab === "consular") && (
                        <section className="p-card">
                          <h2>
                            {tab === "documents"
                              ? "Required documents"
                              : "Embassy & consular requests"}
                          </h2>
                          {record[tab].length === 0 && <p>No entries yet.</p>}
                          {record[tab].map((d, index) => (
                            <div className="p-tracker" key={index}>
                              <strong>{d.name || d.embassy}</strong>
                              <span>
                                {d.reference || "No reference"}{" "}
                                {d.followup && `· Follow up ${d.followup}`}
                              </span>
                              <select
                                aria-label={`Status for ${d.name || d.embassy}`}
                                value={d.status}
                                disabled={!allowed("caseworker")}
                                onChange={(e) =>
                                  save(
                                    tab === "documents"
                                      ? "document"
                                      : "consular",
                                    { ...d, index, status: e.target.value },
                                  )
                                }
                              >
                                {[
                                  ...new Set([
                                    d.status,
                                    ...(tab === "documents"
                                      ? [
                                          "Missing",
                                          "Requested",
                                          "Received",
                                          "Verified",
                                        ]
                                      : [
                                          "Draft",
                                          "Sent",
                                          "Awaiting response",
                                          "Follow-up required",
                                          "Completed",
                                        ]),
                                  ]),
                                ].map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {allowed("caseworker") && (
                            <Form
                              key={tab + record.id}
                              busy={busy}
                              onSubmit={(d) =>
                                save(
                                  tab === "documents" ? "document" : "consular",
                                  d,
                                )
                              }
                              button={
                                tab === "documents"
                                  ? "Add document"
                                  : "Add consular request"
                              }
                            >
                              <Field
                                label={
                                  tab === "documents"
                                    ? "Document name"
                                    : "Embassy or consulate"
                                }
                                name={tab === "documents" ? "name" : "embassy"}
                                required
                                maxLength={500}
                              />
                              <Field
                                label="Reference / contact"
                                name="reference"
                                maxLength={500}
                              />
                              <Field label="Status">
                                <select name="status">
                                  {(tab === "documents"
                                    ? [
                                        "Missing",
                                        "Requested",
                                        "Received",
                                        "Verified",
                                      ]
                                    : [
                                        "Draft",
                                        "Sent",
                                        "Awaiting response",
                                        "Follow-up required",
                                        "Completed",
                                      ]
                                  ).map((s) => (
                                    <option key={s}>{s}</option>
                                  ))}
                                </select>
                              </Field>
                              {tab === "consular" && (
                                <Field
                                  label="Follow-up date"
                                  name="followup"
                                  type="date"
                                  required
                                />
                              )}
                            </Form>
                          )}
                        </section>
                      )}
                      {tab === "medical" && allowed("medical") && (
                        <section className="p-card">
                          <h2>Medical needs & readiness</h2>
                          <p>
                            Restricted to medical employees and supervisors.
                            Record clearance separately in the checklist.
                          </p>
                          <Form
                            key={record.id + record.version}
                            busy={busy}
                            onSubmit={(d) => save("medical", d)}
                          >
                            <Field label="Medical notes">
                              <textarea
                                name="notes"
                                maxLength={5000}
                                defaultValue={record.medical}
                                rows={5}
                              />
                            </Field>
                          </Form>
                        </section>
                      )}
                      {tab === "travel" && (
                        <section className="p-card">
                          <h2>Departure arrangements</h2>
                          <Form
                            key={record.id + record.version}
                            busy={busy || !allowed("travel")}
                            onSubmit={(d) => save("travel", d)}
                          >
                            <Field
                              label="Exit permit reference"
                              name="permit"
                              defaultValue={record.travel.permit}
                              disabled={!allowed("travel")}
                            />
                            <Field
                              label="Flight and ticket reference"
                              name="flight"
                              defaultValue={record.travel.flight}
                              disabled={!allowed("travel")}
                            />
                            <Field
                              label="Departure date / time (UAE)"
                              name="departure"
                              type="datetime-local"
                              defaultValue={record.travel.departure}
                              disabled={!allowed("travel")}
                            />
                            <Field
                              label="Airport transfer / driver / pickup time"
                              name="transfer"
                              defaultValue={record.travel.transfer}
                              disabled={!allowed("travel")}
                            />
                          </Form>
                          <div className="p-depart">
                            <div>
                              <h3>
                                {ready(record)
                                  ? "All checks complete"
                                  : "Departure is not yet ready"}
                              </h3>
                              <p>
                                {ready(record)
                                  ? "Confirm departure only once the resident has departed."
                                  : "Complete all eight checks and the travel details before closing the case."}
                              </p>
                            </div>
                            <button
                              className="p-primary"
                              disabled={!ready(record) || !allowed("travel")}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "Confirm that this resident has departed? This closes the case.",
                                  )
                                )
                                  save("depart", {});
                              }}
                            >
                              Confirm departure
                            </button>
                          </div>
                        </section>
                      )}
                      {tab === "updates" && (
                        <section className="p-card">
                          <h2>Resident updates</h2>
                          <p>
                            Publish a clear explanation and next step in the
                            resident’s preferred language:{" "}
                            <b>{record.language}</b>.
                          </p>
                          {allowed("caseworker") && (
                            <Form
                              busy={busy}
                              onSubmit={(d) => save("update", d)}
                              button="Publish to resident portal"
                            >
                              <Field
                                label="Message language"
                                name="language"
                                defaultValue={record.language}
                                required
                              />
                              <Field label="Message and next step">
                                <textarea
                                  name="message"
                                  required
                                  maxLength={2000}
                                  rows={3}
                                />
                              </Field>
                            </Form>
                          )}
                          {record.updates
                            .slice()
                            .reverse()
                            .map((u, i) => (
                              <article className="p-update" key={i}>
                                <small>
                                  {u.date} · {u.language}
                                </small>
                                <p>{u.message}</p>
                              </article>
                            ))}
                        </section>
                      )}
                      {tab === "audit" && (
                        <section className="p-card">
                          <h2>Record activity</h2>
                          {audit.map((a, i) => (
                            <div className="p-fact" key={i}>
                              <span>
                                {a.at} · {a.actor}
                              </span>
                              <strong>{a.action}</strong>
                            </div>
                          ))}
                        </section>
                      )}
                    </fieldset>
                  </>
                ) : (
                  <>
                    <div className="p-stats">
                      <Stat
                        icon={Users}
                        label="Active residents"
                        value={active.length}
                      />
                      <Stat
                        icon={Clock}
                        label="Overdue tasks"
                        value={
                          active.flatMap((r) => r.tasks || []).filter(overdue)
                            .length
                        }
                      />
                      <Stat
                        icon={Bell}
                        label="Escalated tasks"
                        value={
                          active
                            .flatMap((r) => r.tasks || [])
                            .filter((t) => t.escalated && !t.done).length
                        }
                      />
                      <Stat
                        icon={Plane}
                        label="Ready to depart"
                        value={active.filter(ready).length}
                      />
                    </div>
                    {page === "overview" && (
                      <section className="p-welcome">
                        <div>
                          <p className="p-eyebrow">
                            ONE RECORD, SHARED RESPONSIBILITY
                          </p>
                          <h2>A clear path from arrival to departure</h2>
                          <p>
                            Coordinate identity, consular support, medical
                            readiness and travel in parallel.
                          </p>
                        </div>
                        <ShieldCheck size={46} />
                      </section>
                    )}
                    {page === "tasks" ? (
                      <section className="p-card">
                        <h2>Team work queue</h2>
                        <p>Overdue and escalated items appear first.</p>
                        {active
                          .flatMap((r) =>
                            (r.tasks || [])
                              .filter(
                                (t) =>
                                  !t.done &&
                                  (user.role === "supervisor" ||
                                    t.team === user.role),
                              )
                              .map((t) => ({ ...t, record: r })),
                          )
                          .sort(
                            (a, b) =>
                              Number(b.escalated) * 2 +
                              Number(overdue(b)) -
                              (Number(a.escalated) * 2 + Number(overdue(a))),
                          )
                          .map((t) => (
                            <button
                              className="p-queue"
                              key={t.record.id + t.id}
                              onClick={() => {
                                setSelected(t.record.id);
                                setTab("checklist");
                              }}
                            >
                              <span>
                                <b>{t.title}</b>
                                <small>
                                  {t.record.name} · {t.owner || "Unassigned"} ·{" "}
                                  {t.team}
                                </small>
                              </span>
                              <span>
                                {t.due || "No deadline"}{" "}
                                <Pill>
                                  {t.escalated
                                    ? "Escalated"
                                    : overdue(t)
                                      ? "Overdue"
                                      : "Pending"}
                                </Pill>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          ))}
                        {!active.length && <p>No active cases.</p>}
                      </section>
                    ) : (
                      <section className="p-card">
                        <div className="p-section-title">
                          <h2>
                            {page === "departures"
                              ? "Departure planning"
                              : "Resident case register"}
                          </h2>
                          <span>{shown.length} records</span>
                        </div>
                        <div className="p-filters">
                          <label className="p-search">
                            <Search size={18} />
                            <input
                              aria-label="Search resident records"
                              placeholder="Search name, case ID or admission reference"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </label>
                          <select
                            aria-label="Filter cases"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            {[
                              "All",
                              "In progress",
                              "Overdue",
                              "Ready",
                              "Departed",
                            ].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div className="p-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Resident</th>
                                <th>Language</th>
                                <th>Progress</th>
                                <th>
                                  {page === "departures"
                                    ? "Travel arrangements"
                                    : "Next action"}
                                </th>
                                <th>Status</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {shown.map((r) => (
                                <tr key={r.id}>
                                  <td>
                                    <strong>{r.name}</strong>
                                    <small>
                                      {r.id} · {r.nationality}
                                    </small>
                                  </td>
                                  <td>{r.language}</td>
                                  <td>
                                    <div className="p-progress">
                                      <span
                                        style={{
                                          width: `${(r.tasks.filter((t) => t.done).length / 8) * 100}%`,
                                        }}
                                      />
                                    </div>
                                    <small>
                                      {r.tasks.filter((t) => t.done).length}/8
                                      checks
                                    </small>
                                  </td>
                                  <td>
                                    {page === "departures"
                                      ? r.travel.flight || "Flight not arranged"
                                      : r.tasks.find((t) => !t.done)?.title ||
                                        "Confirm departure"}
                                  </td>
                                  <td>
                                    <Pill
                                      good={ready(r) || r.status === "Departed"}
                                    >
                                      {r.status === "Departed"
                                        ? "Departed"
                                        : ready(r)
                                          ? "Ready"
                                          : r.tasks.some(overdue)
                                            ? "Needs attention"
                                            : "In progress"}
                                    </Pill>
                                  </td>
                                  <td>
                                    <button
                                      className="p-open"
                                      aria-label={`Open ${r.name}`}
                                      onClick={() => {
                                        setSelected(r.id);
                                        setTab(
                                          page === "departures"
                                            ? "travel"
                                            : DEFAULT_TABS[user.role] ||
                                                "overview",
                                        );
                                        setNotice("");
                                      }}
                                    >
                                      Open <ArrowRight size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {!shown.length && (
                            <div className="p-empty">
                              <Users size={30} />
                              <h3>No resident records found</h3>
                              <p>
                                {records.length
                                  ? "Try a different search or filter."
                                  : "Start with a new admission to create the first resident record."}
                              </p>
                            </div>
                          )}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </>
            )}
          </main>
        </div>
      )}
      <footer className="p-footer">
        GDRFA Dubai · {isResident ? "Resident services" : "Employee operations"}{" "}
        · Shelter care and coordination
      </footer>
    </div>
  );
}
