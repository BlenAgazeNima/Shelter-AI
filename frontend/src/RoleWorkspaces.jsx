import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Camera,
  ClipboardList,
  ArrowRight,
  Users,
  Clock,
  LogOut,
} from "lucide-react";
import { Monitoring, AccountSettings } from "./ServicePanels.jsx";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, DEFAULT_TABS } from "./roles.js";

export function TeamHome({ user, records, onOpen }) {
  const active = records.filter((r) => r.status !== "Departed");
  const tasks = active.flatMap((r) =>
    r.tasks
      .filter((t) => t.team === user.role && !t.done)
      .map((t) => ({ ...t, record: r })),
  );
  const overdue = (t) => t.due && t.due < new Date().toISOString().slice(0, 10);
  const title = {
    caseworker: "Case coordination desk",
    medical: "Medical clearance centre",
    travel: "Travel & departure desk",
  }[user.role];
  return (
    <>
      <div className="p-title">
        <div>
          <p className="p-eyebrow">{ROLE_LABELS[user.role]} WORKSPACE</p>
          <h1>{title}</h1>
          <p>{ROLE_DESCRIPTIONS[user.role]}</p>
        </div>
      </div>
      <div className="p-stats">
        <div className="p-stat">
          <Users />
          <div>
            <strong>{active.length}</strong>
            <span>Active residents</span>
          </div>
        </div>
        <div className="p-stat">
          <ClipboardList />
          <div>
            <strong>{tasks.length}</strong>
            <span>Your team's pending checks</span>
          </div>
        </div>
        <div className="p-stat">
          <Clock />
          <div>
            <strong>{tasks.filter(overdue).length}</strong>
            <span>Overdue team checks</span>
          </div>
        </div>
        <div className="p-stat">
          <ShieldCheck />
          <div>
            <strong>
              {
                active
                  .flatMap((r) => r.tasks)
                  .filter((t) => t.team === user.role && t.done).length
              }
            </strong>
            <span>Team checks complete</span>
          </div>
        </div>
      </div>
      <section className="p-welcome">
        <div>
          <p className="p-eyebrow">YOUR RESPONSIBILITIES</p>
          <h2>
            {
              {
                caseworker:
                  "Documents, consular coordination and resident support",
                medical: "Medical needs, clearance and fitness to travel",
                travel: "Permits, flights and safe airport handover",
              }[user.role]
            }
          </h2>
          <p>
            Open a resident to complete your department's work. Changes are
            shared with the shelter manager.
          </p>
        </div>
      </section>
      <section className="p-card">
        <h2>Your work queue</h2>
        {!tasks.length && <p>No pending checks for your team.</p>}
        {tasks
          .sort((a, b) => Number(!!overdue(b)) - Number(!!overdue(a)))
          .map((t) => (
            <button
              className="p-queue"
              key={t.record.id + t.id}
              onClick={() => onOpen(t.record, DEFAULT_TABS[user.role])}
            >
              <span>
                <b>{t.record.name}</b>
                <small>
                  {t.title} · {t.owner || "Assign owner"} ·{" "}
                  {t.due || "Set deadline"}
                </small>
              </span>
              <span className="p-pill">
                {overdue(t) ? "Overdue" : "Pending"}
              </span>
              <ArrowRight size={18} />
            </button>
          ))}
      </section>
    </>
  );
}

export function SecurityWorkspace({ user, api, onSession, profile = false }) {
  const [page, setPage] = useState("overview"),
    [roster, setRoster] = useState([]),
    [movements, setMovements] = useState([]),
    [alerts, setAlerts] = useState([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [r, m, a] = await Promise.all([
        api("/security/roster"),
        api("/security/movements"),
        api("/alerts?limit=200"),
      ]);
      setRoster(r);
      setMovements(m);
      setAlerts(a);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="p-shell">
      <aside className="p-sidebar">
        <p>SECURITY WORKSPACE</p>
        {[
          ["overview", "Security overview", ShieldCheck],
          ["monitoring", "Video & incidents", Camera],
          ["movements", "Gate & transfers", ClipboardList],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            className={id === page ? "active" : ""}
            onClick={() => setPage(id)}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
        <div className="p-sidebar-note">
          <ShieldCheck />
          <b>Safety and controlled access</b>
          <span>
            Case documents and medical records are restricted to their assigned
            teams.
          </span>
        </div>
      </aside>
      <main className="p-content">
        {profile ? (
          <AccountSettings api={api} user={user} onSession={onSession} />
        ) : page === "monitoring" ? (
          <Monitoring api={api} user={user} />
        ) : (
          <>
            <div className="p-title">
              <div>
                <p className="p-eyebrow">SECURITY OFFICER</p>
                <h1>
                  {page === "overview"
                    ? "Shelter safety centre"
                    : "Gate & transfer register"}
                </h1>
                <p>
                  Coordinate site safety, resident movements and airport
                  handovers.
                </p>
              </div>
              <button className="p-secondary" onClick={load}>
                Refresh
              </button>
            </div>
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
            <div className="p-stats">
              <div className="p-stat">
                <Users />
                <div>
                  <strong>
                    {roster.filter((r) => r.status !== "Departed").length}
                  </strong>
                  <span>Residents on register</span>
                </div>
              </div>
              <div className="p-stat">
                <ShieldCheck />
                <div>
                  <strong>
                    {
                      alerts.filter((a) =>
                        ["Open", "Under Review"].includes(a.status),
                      ).length
                    }
                  </strong>
                  <span>Concerns awaiting review</span>
                </div>
              </div>
              <div className="p-stat">
                <ClipboardList />
                <div>
                  <strong>
                    {
                      movements.filter(
                        (m) =>
                          m.created.slice(0, 10) ===
                          new Date().toISOString().slice(0, 10),
                      ).length
                    }
                  </strong>
                  <span>Movements today (UTC)</span>
                </div>
              </div>
            </div>
            {page === "overview" && (
              <section className="p-welcome">
                <div>
                  <h2>Video review and incident response</h2>
                  <p>
                    Review the available recordings, raise concerns and record
                    the response.
                  </p>
                </div>
                <button
                  className="p-primary"
                  onClick={() => setPage("monitoring")}
                >
                  Open video & incidents
                </button>
              </section>
            )}
            <section className="p-card">
              <h2>Record a resident movement</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  setBusy(true);
                  setError("");
                  try {
                    await api("/security/movements", {
                      method: "POST",
                      body: JSON.stringify(
                        Object.fromEntries(new FormData(form)),
                      ),
                    });
                    form.reset();
                    setNotice("Movement recorded.");
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
                    <span>Resident</span>
                    <select name="case_id" required>
                      <option value="">Select resident</option>
                      {roster.map((r) => (
                        <option value={r.id} key={r.id}>
                          {r.name} · {r.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="p-field">
                    <span>Movement</span>
                    <select name="event">
                      {[
                        "Arrival",
                        "Internal transfer",
                        "Airport handover",
                        "Return",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className="p-field">
                    <span>Location / destination</span>
                    <input name="location" required maxLength={150} />
                  </label>
                  <label className="p-field">
                    <span>Handover details / transport reference</span>
                    <textarea name="notes" required maxLength={1000} rows={3} />
                  </label>
                </div>
                <button className="p-primary" disabled={busy || !roster.length}>
                  {busy ? "Saving…" : "Record movement"}
                </button>
                {!roster.length && (
                  <p>Residents appear here after admission by the case team.</p>
                )}
              </form>
            </section>
            <section className="p-card">
              <h2>Movement history</h2>
              {!movements.length && <p>No movements recorded.</p>}
              {movements.map((m) => (
                <article className="p-update" key={m.id}>
                  <small>
                    {m.created} UTC · {m.officer}
                  </small>
                  <p>
                    <strong>
                      {m.resident} · {m.event}
                    </strong>
                    <br />
                    {m.location} — {m.notes}
                  </p>
                </article>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
