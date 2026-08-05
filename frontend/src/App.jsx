import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Users,
  X
} from "lucide-react";

const API = "/api";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "live-monitoring", label: "Live Monitoring", icon: Camera },
  { id: "occupancy", label: "Occupancy", icon: Users },
  { id: "health", label: "Health", icon: HeartPulse },
  { id: "incidents", label: "Alerts & Incidents", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: FileText }
];

const ACTIVE_ALERT_STATUSES = new Set(["Open", "Under Review"]);

function Metric({ icon: Icon, label, value, note }) {
  return (
    <article className="metric-card">
      <span className="metric-icon">
        <Icon size={22} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function AlertBadge({ severity }) {
  const normalized = String(severity || "Low").toLowerCase();
  return (
    <span className={`severity ${normalized}`}>
      {String(severity || "Low").toUpperCase()}
    </span>
  );
}

function App() {
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [health, setHealth] = useState([]);
  const [overview, setOverview] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [alertTab, setAlertTab] = useState("queue");
  const [severityFilter, setSeverityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [reviewNote, setReviewNote] = useState("");
  const [incidentCategory, setIncidentCategory] = useState("Safety incident");
  const [actionTaken, setActionTaken] = useState("");
  const [dismissalReason, setDismissalReason] = useState("False detection");
  const [savingReview, setSavingReview] = useState(false);

  const [theme, setTheme] = useState(
    () => localStorage.getItem("shelter-theme") || "light"
  );

  const refresh = async () => {
    try {
      const responses = await Promise.all([
        fetch(`${API}/cameras`),
        fetch(`${API}/alerts?limit=200`),
        fetch(`${API}/incidents?limit=200`),
        fetch(`${API}/residents/health`),
        fetch(`${API}/overview`)
      ]);

      const failed = responses.find((response) => !response.ok);
      if (failed) throw new Error(`Backend returned HTTP ${failed.status}`);

      const [
        cameraData,
        alertData,
        incidentData,
        healthData,
        overviewData
      ] = await Promise.all(responses.map((response) => response.json()));

      setCameras(Array.isArray(cameraData) ? cameraData : []);
      setAlerts(Array.isArray(alertData) ? alertData : []);
      setIncidents(Array.isArray(incidentData) ? incidentData : []);
      setHealth(Array.isArray(healthData) ? healthData : []);
      setOverview(overviewData ?? {});
      setError("");
    } catch (requestError) {
      console.error(requestError);
      setError(
        "The dashboard could not retrieve backend data. Confirm FastAPI is running on port 8000."
      );
    }
  };

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("shelter-theme", theme);
  }, [theme]);

  useEffect(() => {
    refresh();
    const dataTimer = setInterval(refresh, 3000);
    const clockTimer = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);

  useEffect(() => {
    const modalOpen = Boolean(selectedCamera || selectedAlert);
    if (!modalOpen) return undefined;

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setSelectedCamera(null);
        setSelectedAlert(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedCamera, selectedAlert]);

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => ACTIVE_ALERT_STATUSES.has(alert.status)),
    [alerts]
  );

  const dismissedAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "Dismissed"),
    [alerts]
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredCameras = useMemo(() => {
    if (!normalizedSearch) return cameras;
    return cameras.filter((camera) =>
      [
        camera.name,
        camera.location,
        camera.mode,
        camera.last_event,
        camera.camera_id
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [cameras, normalizedSearch]);

  const filterAlertCollection = (collection) =>
    collection.filter((alert) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          alert.id,
          alert.title,
          alert.details,
          alert.severity,
          alert.status,
          alert.camera_id,
          alert.reviewed_by,
          alert.dismissal_reason
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesSeverity =
        severityFilter === "All" || alert.severity === severityFilter;

      const matchesStatus =
        statusFilter === "All" || alert.status === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    });

  const queueAlerts = useMemo(
    () => filterAlertCollection(activeAlerts),
    [activeAlerts, normalizedSearch, severityFilter, statusFilter]
  );

  const historyAlerts = useMemo(
    () => filterAlertCollection(dismissedAlerts),
    [dismissedAlerts, normalizedSearch, severityFilter, statusFilter]
  );

  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          incident.id,
          incident.source_alert_id,
          incident.title,
          incident.category,
          incident.severity,
          incident.status,
          incident.camera_id,
          incident.verified_by,
          incident.action_taken,
          incident.note
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      const matchesSeverity =
        severityFilter === "All" || incident.severity === severityFilter;

      const matchesStatus =
        statusFilter === "All" || incident.status === statusFilter;

      return matchesSearch && matchesSeverity && matchesStatus;
    });
  }, [
    incidents,
    normalizedSearch,
    severityFilter,
    statusFilter
  ]);

  const filteredHealth = useMemo(() => {
    if (!normalizedSearch) return health;
    return health.filter((resident) =>
      [
        resident.resident,
        resident.resident_id,
        resident.status,
        resident.temperature,
        resident.heart_rate,
        resident.oxygen
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [health, normalizedSearch]);

  const navigate = (destination) => {
    setMenuOpen(false);
    setNotificationOpen(false);

    if (destination === "incidents") {
      setCurrentPage("incidents");
      setActiveSection("incidents");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setCurrentPage("dashboard");
    setActiveSection(destination);

    requestAnimationFrame(() => {
      const target = document.getElementById(destination);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const openAlert = async (alert) => {
    setSelectedAlert(alert);
    setReviewNote(alert.officer_note || "");
    setDismissalReason(alert.dismissal_reason || "False detection");
    setIncidentCategory(alert.category || "Safety incident");
    setActionTaken(alert.action_taken || "");

    if (alert.status === "Open") {
      try {
        await fetch(`${API}/alerts/${alert.id}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ officer: "Operations Officer" })
        });
        await refresh();
        setSelectedAlert((current) =>
          current ? { ...current, status: "Under Review" } : current
        );
      } catch (reviewError) {
        console.error(reviewError);
      }
    }
  };

  const verifyAlert = async () => {
    if (!selectedAlert) return;
    setSavingReview(true);

    try {
      const response = await fetch(
        `${API}/alerts/${selectedAlert.id}/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            officer: "Operations Officer",
            category: incidentCategory,
            action_taken: actionTaken,
            note: reviewNote
          })
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      setSelectedAlert(null);
      setAlertTab("incidents");
      await refresh();
    } catch (verifyError) {
      console.error(verifyError);
      setError("The alert could not be verified.");
    } finally {
      setSavingReview(false);
    }
  };

  const dismissAlert = async () => {
    if (!selectedAlert) return;
    setSavingReview(true);

    try {
      const response = await fetch(
        `${API}/alerts/${selectedAlert.id}/dismiss`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            officer: "Operations Officer",
            reason: dismissalReason,
            note: reviewNote
          })
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      /*
        The dismissed item disappears from the active queue because the queue
        only contains Open and Under Review alerts. It remains in History.
      */
      setSelectedAlert(null);
      await refresh();
    } catch (dismissError) {
      console.error(dismissError);
      setError("The alert could not be dismissed.");
    } finally {
      setSavingReview(false);
    }
  };

  const resolveIncident = async (incidentId) => {
    try {
      const response = await fetch(
        `${API}/incidents/${incidentId}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            officer: "Operations Officer",
            resolution_note: "Incident closed from command centre dashboard."
          })
        }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await refresh();
    } catch (resolveError) {
      console.error(resolveError);
      setError("The incident could not be resolved.");
    }
  };

  const exportReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      overview,
      cameras,
      active_alert_queue: activeAlerts,
      dismissed_alert_history: dismissedAlerts,
      incidents,
      resident_health: health
    };

    const file = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gdrfa-shelter-report-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderHeader = () => (
    <>
      <div className="uae-strip">
        <span>United Arab Emirates Government</span>
        <span>العربية &nbsp; | &nbsp; Accessibility</span>
      </div>

      <header>
        <button
          className="menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
        >
          <Menu />
        </button>

        <img src="/gdrfa-logo.png" alt="GDRFA Dubai" />

        <div className="header-search">
          <Search size={18} />
          <input
            type="search"
            placeholder="Search cameras, alerts, incidents or residents"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {searchTerm && (
            <button
              className="search-clear"
              onClick={() => setSearchTerm("")}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <button
          className="theme-toggle"
          onClick={() =>
            setTheme((value) => (value === "dark" ? "light" : "dark"))
          }
        >
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>

        <div className="notification-wrap">
          <button
            className="bell"
            onClick={() => setNotificationOpen((value) => !value)}
            aria-label={`${activeAlerts.length} active alerts`}
          >
            <Bell />
            <i>{activeAlerts.length}</i>
          </button>

          {notificationOpen && (
            <div className="notification-panel">
              <div className="notification-head">
                <strong>Recent alerts</strong>
                <span>{activeAlerts.length} active</span>
              </div>

              <div className="notification-list">
                {activeAlerts.slice(0, 5).map((alert) => (
                  <button
                    key={alert.id}
                    className="notification-item"
                    onClick={() => {
                      setCurrentPage("incidents");
                      setAlertTab("queue");
                      setNotificationOpen(false);
                      openAlert(alert);
                    }}
                  >
                    <AlertBadge severity={alert.severity} />
                    <span>
                      <b>{alert.title}</b>
                      <small>{alert.camera_id} · {alert.status}</small>
                    </span>
                  </button>
                ))}

                {activeAlerts.length === 0 && (
                  <p className="notification-empty">No active alerts.</p>
                )}
              </div>

              <button
                className="view-all-alerts"
                onClick={() => navigate("incidents")}
              >
                View all alerts and incidents
              </button>
            </div>
          )}
        </div>

        <div className="profile">
          <b>Operations Officer</b>
          <span>Shelter Command Centre</span>
        </div>
      </header>

      <nav className="topnav">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={activeSection === item.id ? "active" : ""}
            onClick={(event) => {
              event.preventDefault();
              navigate(item.id);
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );

  const renderSidebar = () => (
    <aside className={menuOpen ? "open" : ""}>
      <button className="close" onClick={() => setMenuOpen(false)}>
        <X />
      </button>

      <h3>AI Shelter Management</h3>

      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={activeSection === item.id ? "selected" : ""}
            onClick={(event) => {
              event.preventDefault();
              navigate(item.id);
            }}
          >
            <Icon />
            {item.label}
          </a>
        );
      })}

      <div className="secure">
        <ShieldCheck />
        <div>
          <b>Protected system</b>
          <span>Human verification enabled</span>
        </div>
      </div>
    </aside>
  );

  const renderDashboard = () => (
    <main>
      <section className="hero page-section" id="dashboard">
        <div>
          <span className="eyebrow">GDRFA DUBAI · VIOLATORS SHELTER</span>
          <h1>AI Shelter Operations Centre</h1>
          <p>
            Prerecorded MP4 footage is processed frame-by-frame by YOLO,
            ByteTrack and OpenCV. AI detections are reviewed by human officers.
          </p>
        </div>

        <div className="clock">
          <Clock />
          <b>{now.toLocaleTimeString()}</b>
          <span>{now.toLocaleDateString()}</span>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      <section className="metrics page-section" id="occupancy">
        <Metric
          icon={Users}
          label="Detected occupancy"
          value={`${overview.occupancy ?? 0} / ${overview.capacity ?? 0}`}
          note="Across monitored areas"
        />
        <Metric
          icon={Camera}
          label="Active AI cameras"
          value={overview.active_cameras ?? 0}
          note="MP4 live simulation"
        />
        <Metric
          icon={AlertTriangle}
          label="Active alert queue"
          value={activeAlerts.length}
          note={`${overview.critical_alerts ?? 0} critical`}
        />
        <Metric
          icon={Activity}
          label="Verified incidents"
          value={incidents.length}
          note={overview.model ?? "YOLO"}
        />
      </section>

      <section className="page-section" id="live-monitoring">
        <div className="section-title">
          <div>
            <h2>Live AI monitoring</h2>
            <p>Click a feed to open the larger command-centre view.</p>
          </div>
          <span className="live"><i /> AI PROCESSING ACTIVE</span>
        </div>

        <div className="camera-grid">
          {filteredCameras.map((camera) => (
            <article
              className="camera-card clickable-camera"
              key={camera.camera_id}
              onClick={() => setSelectedCamera(camera)}
            >
              <div className="camera-head">
                <div>
                  <b>{camera.name}</b>
                  <span>{camera.location}</span>
                </div>
                <div className="camera-head-actions">
                  <span className="feed-status"><i /> LIVE</span>
                  <button
                    className="expand-camera"
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelectedCamera(camera);
                    }}
                  >
                    Open larger
                  </button>
                </div>
              </div>

              <div className="feed-wrap">
                <img
                  src={`${API}/cameras/${camera.camera_id}/stream`}
                  alt={camera.name}
                />
                <span className="ai-chip">YOLO + ByteTrack</span>
              </div>

              <div className="camera-stats">
                <span><small>People</small><b>{camera.people}</b></span>
                <span><small>FPS</small><b>{camera.fps}</b></span>
                <span><small>Mode</small><b>{camera.mode}</b></span>
              </div>

              <div className={`event ${
                camera.last_event === "No active incident"
                  ? "normal"
                  : "warning"
              }`}>
                {camera.last_event}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lower-grid">
        <article className="panel page-section" id="incidents">
          <div className="panel-head">
            <div>
              <h2>Active alert queue</h2>
              <p>Only Open and Under Review alerts appear here.</p>
            </div>
            <AlertTriangle />
          </div>

          <div className="alert-list">
            {activeAlerts.slice(0, 5).map((alert) => (
              <button
                className="dashboard-alert-row"
                key={alert.id}
                onClick={() => {
                  setCurrentPage("incidents");
                  setAlertTab("queue");
                  openAlert(alert);
                }}
              >
                <AlertBadge severity={alert.severity} />
                <span>
                  <b>{alert.title}</b>
                  <small>{alert.camera_id} · {alert.status}</small>
                </span>
                <Eye size={16} />
              </button>
            ))}

            {activeAlerts.length === 0 && (
              <p className="empty">No active alerts.</p>
            )}
          </div>

          <button
            className="panel-link"
            onClick={() => navigate("incidents")}
          >
            Open full Alerts & Incidents page
          </button>
        </article>

        <article className="panel page-section" id="health">
          <div className="panel-head">
            <div>
              <h2>Resident health indicators</h2>
              <p>Synthetic sensor values for prototype demonstration.</p>
            </div>
            <HeartPulse />
          </div>

          <div className="health-list">
            {filteredHealth.map((item) => (
              <div className="health-row" key={item.resident_id}>
                <div>
                  <b>{item.resident}</b>
                  <span>{item.resident_id}</span>
                </div>
                <span><small>Temperature</small><b>{item.temperature}°C</b></span>
                <span><small>Heart rate</small><b>{item.heart_rate} bpm</b></span>
                <span><small>SpO₂</small><b>{item.oxygen}%</b></span>
                <strong className={item.status === "Normal" ? "ok" : "review"}>
                  {item.status}
                </strong>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel reports-section page-section" id="reports">
        <div className="panel-head">
          <div>
            <h2>Operational reports</h2>
            <p>Export the current system snapshot.</p>
          </div>
          <FileText />
        </div>
        <div className="report-content">
          <div>
            <strong>Current system snapshot</strong>
            <span>Includes alerts, incidents, health and camera status.</span>
          </div>
          <button onClick={exportReport}>
            <Download size={16} /> Export JSON report
          </button>
        </div>
      </section>

      <footer>
        <CheckCircle2 />
        AI raises alerts; trained officers verify or dismiss them.
      </footer>
    </main>
  );

  const renderAlertsPage = () => {
    const selectedCollection =
      alertTab === "queue"
        ? queueAlerts
        : alertTab === "history"
        ? historyAlerts
        : filteredIncidents;

    return (
      <main className="incidents-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">HUMAN-IN-THE-LOOP REVIEW</span>
            <h1>Alerts & Incidents</h1>
            <p>
              Review AI alerts, verify real events, dismiss false detections,
              and resolve confirmed incidents.
            </p>
          </div>
          <button className="back-dashboard" onClick={() => navigate("dashboard")}>
            Back to dashboard
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        <section className="incident-summary-grid">
          <Metric
            icon={Bell}
            label="Active queue"
            value={activeAlerts.length}
            note="Open + Under Review"
          />
          <Metric
            icon={AlertTriangle}
            label="Critical alerts"
            value={activeAlerts.filter((a) => a.severity === "Critical").length}
            note="Requires immediate review"
          />
          <Metric
            icon={CheckCircle2}
            label="Verified incidents"
            value={incidents.length}
            note="Confirmed by officers"
          />
          <Metric
            icon={X}
            label="Dismissed history"
            value={dismissedAlerts.length}
            note="Retained for audit"
          />
        </section>

        <section className="alert-workspace">
          <div className="alert-tabs">
            <button
              className={alertTab === "queue" ? "active" : ""}
              onClick={() => setAlertTab("queue")}
            >
              Active Queue <span>{activeAlerts.length}</span>
            </button>
            <button
              className={alertTab === "incidents" ? "active" : ""}
              onClick={() => setAlertTab("incidents")}
            >
              Verified Incidents <span>{incidents.length}</span>
            </button>
            <button
              className={alertTab === "history" ? "active" : ""}
              onClick={() => setAlertTab("history")}
            >
              Dismissed History <span>{dismissedAlerts.length}</span>
            </button>
          </div>

          <div className="alert-filters">
            <label>
              Severity
              <select
                value={severityFilter}
                onChange={(event) => setSeverityFilter(event.target.value)}
              >
                <option>All</option>
                <option>Critical</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>

            <label>
              Status
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All</option>
                {alertTab === "queue" && (
                  <>
                    <option>Open</option>
                    <option>Under Review</option>
                  </>
                )}
                {alertTab === "incidents" && (
                  <>
                    <option>Active</option>
                    <option>Resolved</option>
                  </>
                )}
                {alertTab === "history" && <option>Dismissed</option>}
              </select>
            </label>
          </div>

          <div className="alert-table-wrap">
            <table className="alert-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Severity</th>
                  <th>Event</th>
                  <th>Camera</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Time</th>
                  <th>Action</th>
                </tr>
              </thead>

              <tbody>
                {alertTab !== "incidents" &&
                  selectedCollection.map((alert) => (
                    <tr key={alert.id}>
                      <td>ALT-{alert.id}</td>
                      <td><AlertBadge severity={alert.severity} /></td>
                      <td>
                        <b>{alert.title}</b>
                        <small>{alert.details}</small>
                      </td>
                      <td>{alert.camera_id}</td>
                      <td>{Math.round(alert.confidence * 100)}%</td>
                      <td><span className="status-chip">{alert.status}</span></td>
                      <td>{new Date(`${alert.created_at}Z`).toLocaleString()}</td>
                      <td>
                        <button
                          className="review-button"
                          onClick={() => openAlert(alert)}
                        >
                          {alert.status === "Dismissed" ? "View" : "Review"}
                        </button>
                      </td>
                    </tr>
                  ))}

                {alertTab === "incidents" &&
                  selectedCollection.map((incident) => (
                    <tr key={incident.id}>
                      <td>INC-{incident.id}</td>
                      <td><AlertBadge severity={incident.severity} /></td>
                      <td>
                        <b>{incident.title}</b>
                        <small>{incident.category}</small>
                      </td>
                      <td>{incident.camera_id}</td>
                      <td>Verified</td>
                      <td><span className="status-chip">{incident.status}</span></td>
                      <td>{new Date(`${incident.verified_at}Z`).toLocaleString()}</td>
                      <td>
                        {incident.status !== "Resolved" ? (
                          <button
                            className="review-button"
                            onClick={() => resolveIncident(incident.id)}
                          >
                            Resolve
                          </button>
                        ) : (
                          <span className="resolved-label">Closed</span>
                        )}
                      </td>
                    </tr>
                  ))}

                {selectedCollection.length === 0 && (
                  <tr>
                    <td colSpan="8" className="table-empty">
                      No matching records.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  };

  return (
    <div className="app">
      {renderHeader()}

      <div className="layout">
        {renderSidebar()}
        {currentPage === "incidents"
          ? renderAlertsPage()
          : renderDashboard()}
      </div>

      {selectedCamera && (
        <div
          className="camera-modal-backdrop"
          onClick={() => setSelectedCamera(null)}
        >
          <section
            className="camera-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="camera-modal-header">
              <div>
                <span>LIVE AI MONITORING</span>
                <h2>{selectedCamera.name}</h2>
                <p>{selectedCamera.location}</p>
              </div>
              <button
                className="camera-modal-close"
                onClick={() => setSelectedCamera(null)}
              >
                <X />
              </button>
            </div>

            <div className="camera-modal-feed">
              <img
                src={`${API}/cameras/${selectedCamera.camera_id}/stream`}
                alt={selectedCamera.name}
              />
              <span className="camera-modal-ai">YOLO + ByteTrack processing</span>
            </div>

            <div className="camera-modal-stats">
              <div><small>People</small><strong>{selectedCamera.people}</strong></div>
              <div><small>Speed</small><strong>{selectedCamera.fps} FPS</strong></div>
              <div><small>Mode</small><strong>{selectedCamera.mode}</strong></div>
              <div><small>Event</small><strong>{selectedCamera.last_event}</strong></div>
            </div>
          </section>
        </div>
      )}

      {selectedAlert && (
        <div
          className="camera-modal-backdrop"
          onClick={() => setSelectedAlert(null)}
        >
          <section
            className="alert-review-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="camera-modal-header">
              <div>
                <span>OFFICER REVIEW</span>
                <h2>{selectedAlert.title}</h2>
                <p>
                  ALT-{selectedAlert.id} · {selectedAlert.camera_id} ·{" "}
                  {selectedAlert.status}
                </p>
              </div>
              <button
                className="camera-modal-close"
                onClick={() => setSelectedAlert(null)}
              >
                <X />
              </button>
            </div>

            <div className="alert-review-grid">
              <div className="alert-evidence">
                <div className="alert-video-placeholder">
                  <img
                    src={`${API}/cameras/${selectedAlert.camera_id}/stream`}
                    alt="Alert evidence feed"
                  />
                  <span>Live camera context</span>
                </div>

                <div className="evidence-details">
                  <AlertBadge severity={selectedAlert.severity} />
                  <div><small>AI confidence</small><b>{Math.round(selectedAlert.confidence * 100)}%</b></div>
                  <div><small>Detected</small><b>{new Date(`${selectedAlert.created_at}Z`).toLocaleString()}</b></div>
                  <div><small>Description</small><b>{selectedAlert.details}</b></div>
                </div>
              </div>

              <div className="review-form">
                {selectedAlert.status === "Dismissed" ? (
                  <div className="read-only-review">
                    <h3>Dismissed alert</h3>
                    <p>
                      This alert was removed from the active queue but retained
                      in history.
                    </p>
                    <label>
                      Dismissal reason
                      <input value={selectedAlert.dismissal_reason || "Not provided"} readOnly />
                    </label>
                    <label>
                      Officer note
                      <textarea value={selectedAlert.officer_note || "No note"} readOnly />
                    </label>
                    <label>
                      Reviewed by
                      <input value={selectedAlert.reviewed_by || "Operations Officer"} readOnly />
                    </label>
                  </div>
                ) : (
                  <>
                    <h3>Officer decision</h3>

                    <label>
                      Incident category
                      <select
                        value={incidentCategory}
                        onChange={(event) => setIncidentCategory(event.target.value)}
                      >
                        <option>Safety incident</option>
                        <option>Medical emergency</option>
                        <option>Restricted-area breach</option>
                        <option>Occupancy incident</option>
                        <option>Behavioural incident</option>
                      </select>
                    </label>

                    <label>
                      Action taken
                      <input
                        value={actionTaken}
                        onChange={(event) => setActionTaken(event.target.value)}
                        placeholder="Example: Medical team dispatched"
                      />
                    </label>

                    <label>
                      Officer note
                      <textarea
                        value={reviewNote}
                        onChange={(event) => setReviewNote(event.target.value)}
                        placeholder="Record what you observed and what action was taken."
                      />
                    </label>

                    <label>
                      Dismissal reason
                      <select
                        value={dismissalReason}
                        onChange={(event) => setDismissalReason(event.target.value)}
                      >
                        <option>False detection</option>
                        <option>Normal resident activity</option>
                        <option>Duplicate alert</option>
                        <option>Testing or demonstration event</option>
                        <option>Insufficient evidence</option>
                        <option>Other</option>
                      </select>
                    </label>

                    <div className="review-actions">
                      <button
                        className="verify-action"
                        onClick={verifyAlert}
                        disabled={savingReview}
                      >
                        Verify & Create Incident
                      </button>
                      <button
                        className="dismiss-action"
                        onClick={dismissAlert}
                        disabled={savingReview}
                      >
                        Dismiss Alert
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;