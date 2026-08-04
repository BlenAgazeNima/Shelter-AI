import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, Bell, Camera, CheckCircle2, Clock,
  HeartPulse, LayoutDashboard, Menu, Moon, Search, ShieldCheck, Sun, Users, X
} from "lucide-react";

const API = "/api";

function Metric({ icon: Icon, label, value, note }) {
  return <article className="metric-card">
    <span className="metric-icon"><Icon size={22}/></span>
    <div><p>{label}</p><strong>{value}</strong><small>{note}</small></div>
  </article>;
}

function App() {
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState([]);
  const [overview, setOverview] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("shelter-theme") || "dark");

  const refresh = async () => {
    try {
      const [c, a, h, o] = await Promise.all([
        fetch(`${API}/cameras`).then(r => r.json()),
        fetch(`${API}/alerts?limit=20`).then(r => r.json()),
        fetch(`${API}/residents/health`).then(r => r.json()),
        fetch(`${API}/overview`).then(r => r.json())
      ]);
      setCameras(c); setAlerts(a); setHealth(h); setOverview(o); setError("");
    } catch (e) {
      setError("Backend unavailable. Start backend/run.py first.");
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("shelter-theme", theme);
  }, [theme]);

  useEffect(() => {
    refresh();
    const dataTimer = setInterval(refresh, 2500);
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(dataTimer); clearInterval(clockTimer); };
  }, []);

  const activeAlerts = useMemo(() => alerts.filter(a => a.status === "Open"), [alerts]);

  const updateAlert = async (id, status) => {
    await fetch(`${API}/alerts/${id}`, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({status, officer_note: `Updated from dashboard at ${new Date().toLocaleTimeString()}`})
    });
    refresh();
  };

  return <div className="app">
    <div className="uae-strip"><span>United Arab Emirates Government</span><span>العربية &nbsp; | &nbsp; Accessibility</span></div>
    <header>
      <button className="menu-btn" onClick={() => setMenuOpen(true)}><Menu/></button>
      <img src="/gdrfa-logo.png" alt="GDRFA Dubai" />
      <div className="header-search"><Search size={18}/><input placeholder="Search shelter operations"/></div>
      <button
        className="theme-toggle"
        onClick={() => setTheme(current => current === "dark" ? "light" : "dark")}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      >
        {theme === "dark" ? <Sun size={19}/> : <Moon size={19}/>}
        <span>{theme === "dark" ? "Light" : "Dark"}</span>
      </button>
      <button className="bell"><Bell/><i>{activeAlerts.length}</i></button>
      <div className="profile"><b>Operations Officer</b><span>Shelter Command Centre</span></div>
    </header>
    <nav className="topnav"><a className="active">Dashboard</a><a>Live Monitoring</a><a>Occupancy</a><a>Health</a><a>Incidents</a><a>Reports</a></nav>

    <div className="layout">
      <aside className={menuOpen ? "open" : ""}>
        <button className="close" onClick={() => setMenuOpen(false)}><X/></button>
        <h3>AI Shelter Management</h3>
        <a className="selected"><LayoutDashboard/>Operations Dashboard</a>
        <a><Camera/>Live Camera Feeds</a>
        <a><Users/>Occupancy Monitoring</a>
        <a><HeartPulse/>Health Monitoring</a>
        <a><AlertTriangle/>Alerts & Incidents</a>
        <div className="secure"><ShieldCheck/><div><b>Protected system</b><span>Human verification enabled</span></div></div>
      </aside>

      <main>
        <section className="hero">
          <div><span className="eyebrow">GDRFA DUBAI · VIOLATORS SHELTER</span><h1>AI Shelter Operations Centre</h1><p>Live simulation using prerecorded MP4 footage processed frame-by-frame by YOLO, ByteTrack and OpenCV.</p></div>
          <div className="clock"><Clock/><b>{now.toLocaleTimeString()}</b><span>{now.toLocaleDateString()}</span></div>
        </section>
        {error && <div className="error">{error}</div>}

        <section className="metrics">
          <Metric icon={Users} label="Detected occupancy" value={`${overview.occupancy ?? 0} / ${overview.capacity ?? 0}`} note="Across monitored areas"/>
          <Metric icon={Camera} label="Active AI cameras" value={overview.active_cameras ?? 0} note="MP4 live simulation"/>
          <Metric icon={AlertTriangle} label="Open alerts" value={overview.open_alerts ?? 0} note={`${overview.critical_alerts ?? 0} critical`}/>
          <Metric icon={Activity} label="Detection engine" value="YOLO" note={overview.model ?? "Loading model"}/>
        </section>

        <div className="section-title"><div><h2>Live AI monitoring</h2><p>Bounding boxes and track IDs are generated by the backend—not drawn by React.</p></div><span className="live"><i/>AI PROCESSING ACTIVE</span></div>
        <section className="camera-grid">
          {cameras.map(camera => <article className="camera-card" key={camera.camera_id}>
            <div className="camera-head"><div><b>{camera.name}</b><span>{camera.location}</span></div><span className="feed-status"><i/> LIVE SIMULATION</span></div>
            <div className="feed-wrap"><img src={`${API}/cameras/${camera.camera_id}/stream`} alt={camera.name}/><span className="ai-chip">YOLO + ByteTrack</span></div>
            <div className="camera-stats"><span><small>People</small><b>{camera.people}</b></span><span><small>FPS</small><b>{camera.fps}</b></span><span><small>Mode</small><b>{camera.mode}</b></span></div>
            <div className={`event ${camera.last_event === "No active incident" ? "normal" : "warning"}`}>{camera.last_event}</div>
          </article>)}
        </section>

        <section className="lower-grid">
          <article className="panel alerts-panel">
            <div className="panel-head"><div><h2>AI alert queue</h2><p>Every alert requires officer verification.</p></div><AlertTriangle/></div>
            <div className="alert-list">
              {alerts.length === 0 && <p className="empty">No alerts recorded yet. Let the video processors run for a few seconds.</p>}
              {alerts.map(alert => <div className="alert-row" key={alert.id}>
                <span className={`severity ${alert.severity.toLowerCase()}`}>{alert.severity}</span>
                <div className="alert-copy"><b>{alert.title}</b><span>{alert.camera_id} · {new Date(alert.created_at + "Z").toLocaleString()}</span><small>{alert.details}</small></div>
                <div className="alert-actions"><em>{Math.round(alert.confidence * 100)}%</em><strong>{alert.status}</strong>{alert.status === "Open" && <><button onClick={() => updateAlert(alert.id, "Verified")}>Verify</button><button className="ghost" onClick={() => updateAlert(alert.id, "False Alert")}>Dismiss</button></>}</div>
              </div>)}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head"><div><h2>Resident health indicators</h2><p>Synthetic sensor values for prototype demonstration.</p></div><HeartPulse/></div>
            <div className="health-list">
              {health.map(item => <div className="health-row" key={item.resident_id}>
                <div><b>{item.resident}</b><span>{item.resident_id}</span></div>
                <span><small>Temperature</small><b>{item.temperature}°C</b></span>
                <span><small>Heart rate</small><b>{item.heart_rate} bpm</b></span>
                <span><small>SpO₂</small><b>{item.oxygen}%</b></span>
                <strong className={item.status === "Normal" ? "ok" : "review"}>{item.status}</strong>
              </div>)}
            </div>
          </article>
        </section>
        <footer><CheckCircle2/> Prototype only: prerecorded synthetic videos replace protected live shelter CCTV feeds. Production deployment would use secured RTSP/IP camera streams and approved sensors.</footer>
      </main>
    </div>
  </div>;
}

export default App;
