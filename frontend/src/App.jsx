import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Clock,
  Download,
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
  { id: "incidents", label: "Incidents", icon: AlertTriangle },
  { id: "reports", label: "Reports", icon: FileText }
];

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

function App() {
  const [cameras, setCameras] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState([]);
  const [overview, setOverview] = useState({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [selectedCamera, setSelectedCamera] = useState(null);

  const [theme, setTheme] = useState(
    () => localStorage.getItem("shelter-theme") || "light"
  );

  const refresh = async () => {
    try {
      const responses = await Promise.all([
        fetch(`${API}/cameras`),
        fetch(`${API}/alerts?limit=100`),
        fetch(`${API}/residents/health`),
        fetch(`${API}/overview`)
      ]);

      const failedResponse = responses.find((response) => !response.ok);

      if (failedResponse) {
        throw new Error(`Backend returned HTTP ${failedResponse.status}`);
      }

      const [cameraData, alertData, healthData, overviewData] =
        await Promise.all(responses.map((response) => response.json()));

      setCameras(Array.isArray(cameraData) ? cameraData : []);
      setAlerts(Array.isArray(alertData) ? alertData : []);
      setHealth(Array.isArray(healthData) ? healthData : []);
      setOverview(overviewData ?? {});
      setError("");
    } catch (requestError) {
      console.error(requestError);
      setError(
        "The dashboard could not retrieve live backend data. Confirm that FastAPI is running on port 8000."
      );
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

    return () => {
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);


  useEffect(() => {
    if (!selectedCamera) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSelectedCamera(null);
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedCamera]);

  useEffect(() => {
    const sectionIds = NAV_ITEMS.map((item) => item.id);

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (visibleEntry) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-25% 0px -60% 0px",
        threshold: [0.05, 0.2, 0.5]
      }
    );

    sectionIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredCameras = useMemo(() => {
    if (!normalizedSearch) return cameras;

    return cameras.filter((camera) => {
      const searchableText = [
        camera.name,
        camera.location,
        camera.mode,
        camera.last_event,
        camera.camera_id,
        "camera",
        "live",
        "monitoring"
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [cameras, normalizedSearch]);

  const filteredAlerts = useMemo(() => {
    if (!normalizedSearch) return alerts;

    return alerts.filter((alert) => {
      const searchableText = [
        alert.title,
        alert.details,
        alert.severity,
        alert.status,
        alert.camera_id,
        "alert",
        "incident"
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [alerts, normalizedSearch]);

  const filteredHealth = useMemo(() => {
    if (!normalizedSearch) return health;

    return health.filter((resident) => {
      const searchableText = [
        resident.resident,
        resident.resident_id,
        resident.status,
        resident.temperature,
        resident.heart_rate,
        resident.oxygen,
        "health",
        "resident"
      ]
        .filter((value) => value !== undefined && value !== null)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [health, normalizedSearch]);

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.status === "Open"),
    [alerts]
  );

  const totalSearchResults =
    filteredCameras.length + filteredAlerts.length + filteredHealth.length;

  const scrollToSection = (sectionId) => {
    const target = document.getElementById(sectionId);

    if (!target) return;

    setActiveSection(sectionId);
    setMenuOpen(false);

    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  const handleSearchKeyDown = (event) => {
    if (event.key !== "Enter" || !normalizedSearch) return;

    if (filteredCameras.length > 0) {
      scrollToSection("live-monitoring");
    } else if (filteredAlerts.length > 0) {
      scrollToSection("incidents");
    } else if (filteredHealth.length > 0) {
      scrollToSection("health");
    }
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  const updateAlert = async (id, status) => {
    try {
      const response = await fetch(`${API}/alerts/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          status,
          officer_note: `Updated from dashboard at ${new Date().toLocaleTimeString()}`
        })
      });

      if (!response.ok) {
        throw new Error(`Unable to update alert: HTTP ${response.status}`);
      }

      await refresh();
    } catch (updateError) {
      console.error(updateError);
      setError("The alert could not be updated. Check the backend terminal.");
    }
  };

  const exportReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      overview,
      cameras,
      alerts,
      resident_health: health
    };

    const file = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json"
    });

    const downloadUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");

    anchor.href = downloadUrl;
    anchor.download = `gdrfa-shelter-report-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="app">
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
            placeholder="Search cameras, alerts or residents"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-label="Search shelter operations"
          />

          {searchTerm && (
            <button
              type="button"
              className="search-clear"
              onClick={clearSearch}
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <button
          className="theme-toggle"
          onClick={() =>
            setTheme((current) => (current === "dark" ? "light" : "dark"))
          }
          aria-label={`Switch to ${
            theme === "dark" ? "light" : "dark"
          } mode`}
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>

        <button
          className="bell"
          onClick={() => scrollToSection("incidents")}
          aria-label={`${activeAlerts.length} open alerts`}
        >
          <Bell />
          <i>{activeAlerts.length}</i>
        </button>

        <div className="profile">
          <b>Operations Officer</b>
          <span>Shelter Command Centre</span>
        </div>
      </header>

      <nav className="topnav" aria-label="Primary navigation">
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className={activeSection === item.id ? "active" : ""}
            onClick={(event) => {
              event.preventDefault();
              scrollToSection(item.id);
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>

      <div className="layout">
        <aside className={menuOpen ? "open" : ""}>
          <button
            className="close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>

          <h3>AI Shelter Management</h3>

          {NAV_ITEMS.slice(0, 5).map((item) => {
            const Icon = item.icon;

            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className={activeSection === item.id ? "selected" : ""}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(item.id);
                }}
              >
                <Icon />
                {item.id === "dashboard"
                  ? "Operations Dashboard"
                  : item.id === "live-monitoring"
                  ? "Live Camera Feeds"
                  : item.id === "occupancy"
                  ? "Occupancy Monitoring"
                  : item.id === "health"
                  ? "Health Monitoring"
                  : "Alerts & Incidents"}
              </a>
            );
          })}

          <a
            href="#reports"
            className={activeSection === "reports" ? "selected" : ""}
            onClick={(event) => {
              event.preventDefault();
              scrollToSection("reports");
            }}
          >
            <FileText />
            Reports
          </a>

          <div className="secure">
            <ShieldCheck />
            <div>
              <b>Protected system</b>
              <span>Human verification enabled</span>
            </div>
          </div>
        </aside>

        <main>
          <section className="hero page-section" id="dashboard">
            <div>
              <span className="eyebrow">
                GDRFA DUBAI · VIOLATORS SHELTER
              </span>
              <h1>AI Shelter Operations Centre</h1>
              <p>
                Live simulation using prerecorded MP4 footage processed
                frame-by-frame by YOLO, ByteTrack and OpenCV.
              </p>
            </div>

            <div className="clock">
              <Clock />
              <b>{now.toLocaleTimeString()}</b>
              <span>{now.toLocaleDateString()}</span>
            </div>
          </section>

          {error && <div className="error">{error}</div>}

          {searchTerm && (
            <div className="search-summary" role="status">
              <span>
                <strong>{totalSearchResults}</strong> matching result
                {totalSearchResults === 1 ? "" : "s"} for “{searchTerm}”
              </span>

              <button type="button" onClick={clearSearch}>
                Clear search
              </button>
            </div>
          )}

          <section className="metrics page-section" id="occupancy">
            <Metric
              icon={Users}
              label="Detected occupancy"
              value={`${overview.occupancy ?? 0} / ${
                overview.capacity ?? 0
              }`}
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
              label="Open alerts"
              value={overview.open_alerts ?? 0}
              note={`${overview.critical_alerts ?? 0} critical`}
            />

            <Metric
              icon={Activity}
              label="Detection engine"
              value="YOLO"
              note={overview.model ?? "Loading model"}
            />
          </section>

          <section className="page-section" id="live-monitoring">
            <div className="section-title">
              <div>
                <h2>Live AI monitoring</h2>
                <p>
                  Bounding boxes and track IDs are generated by the backend—not
                  drawn by React.
                </p>
              </div>

              <span className="live">
                <i />
                AI PROCESSING ACTIVE
              </span>
            </div>

            <div className="camera-grid">
              {filteredCameras.length === 0 && (
                <p className="empty search-empty">
                  No camera feeds match “{searchTerm}”.
                </p>
              )}

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
                      <span className="feed-status">
                        <i /> LIVE SIMULATION
                      </span>

                      <button
                        type="button"
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
                    <span>
                      <small>People</small>
                      <b>{camera.people}</b>
                    </span>

                    <span>
                      <small>FPS</small>
                      <b>{camera.fps}</b>
                    </span>

                    <span>
                      <small>Mode</small>
                      <b>{camera.mode}</b>
                    </span>
                  </div>

                  <div
                    className={`event ${
                      camera.last_event === "No active incident"
                        ? "normal"
                        : "warning"
                    }`}
                  >
                    {camera.last_event}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="lower-grid">
            <article
              className="panel alerts-panel page-section"
              id="incidents"
            >
              <div className="panel-head">
                <div>
                  <h2>AI alert queue</h2>
                  <p>Every alert requires officer verification.</p>
                </div>

                <AlertTriangle />
              </div>

              <div className="alert-list">
                {filteredAlerts.length === 0 && (
                  <p className="empty">
                    {searchTerm
                      ? `No alerts match “${searchTerm}”.`
                      : "No alerts recorded yet. Let the video processors run for a few seconds."}
                  </p>
                )}

                {filteredAlerts.map((alert) => (
                  <div className="alert-row" key={alert.id}>
                    <span
                      className={`severity ${alert.severity.toLowerCase()}`}
                    >
                      {alert.severity}
                    </span>

                    <div className="alert-copy">
                      <b>{alert.title}</b>
                      <span>
                        {alert.camera_id} ·{" "}
                        {new Date(
                          `${alert.created_at}Z`
                        ).toLocaleString()}
                      </span>
                      <small>{alert.details}</small>
                    </div>

                    <div className="alert-actions">
                      <em>{Math.round(alert.confidence * 100)}%</em>
                      <strong>{alert.status}</strong>

                      {alert.status === "Open" && (
                        <>
                          <button
                            onClick={() =>
                              updateAlert(alert.id, "Verified")
                            }
                          >
                            Verify
                          </button>

                          <button
                            className="ghost"
                            onClick={() =>
                              updateAlert(alert.id, "False Alert")
                            }
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel page-section" id="health">
              <div className="panel-head">
                <div>
                  <h2>Resident health indicators</h2>
                  <p>
                    Synthetic sensor values for prototype demonstration.
                  </p>
                </div>

                <HeartPulse />
              </div>

              <div className="health-list">
                {filteredHealth.length === 0 && (
                  <p className="empty">
                    {searchTerm
                      ? `No residents match “${searchTerm}”.`
                      : "No resident health data is available."}
                  </p>
                )}

                {filteredHealth.map((item) => (
                  <div className="health-row" key={item.resident_id}>
                    <div>
                      <b>{item.resident}</b>
                      <span>{item.resident_id}</span>
                    </div>

                    <span>
                      <small>Temperature</small>
                      <b>{item.temperature}°C</b>
                    </span>

                    <span>
                      <small>Heart rate</small>
                      <b>{item.heart_rate} bpm</b>
                    </span>

                    <span>
                      <small>SpO₂</small>
                      <b>{item.oxygen}%</b>
                    </span>

                    <strong
                      className={
                        item.status === "Normal" ? "ok" : "review"
                      }
                    >
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
                <p>
                  Export the current dashboard data for review and
                  demonstration.
                </p>
              </div>

              <FileText />
            </div>

            <div className="report-content">
              <div>
                <strong>Current system snapshot</strong>
                <span>
                  Includes occupancy, camera status, incidents and resident
                  health indicators.
                </span>
              </div>

              <button type="button" onClick={exportReport}>
                <Download size={16} />
                Export JSON report
              </button>
            </div>
          </section>

          <footer>
            <CheckCircle2 />
            Prototype only: prerecorded reusable footage replaces protected
            live shelter CCTV feeds. Production deployment would use secured
            RTSP/IP camera streams and approved sensors.
          </footer>
        </main>
      </div>

      {selectedCamera && (
        <div
          className="camera-modal-backdrop"
          onClick={() => setSelectedCamera(null)}
          role="presentation"
        >
          <section
            className="camera-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="camera-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="camera-modal-header">
              <div>
                <span>LIVE AI MONITORING</span>
                <h2 id="camera-modal-title">{selectedCamera.name}</h2>
                <p>{selectedCamera.location}</p>
              </div>

              <button
                type="button"
                className="camera-modal-close"
                onClick={() => setSelectedCamera(null)}
                aria-label="Close expanded camera feed"
              >
                <X size={22} />
              </button>
            </div>

            <div className="camera-modal-feed">
              <img
                src={`${API}/cameras/${selectedCamera.camera_id}/stream`}
                alt={`${selectedCamera.name} expanded live AI feed`}
              />

              <span className="camera-modal-ai">
                YOLO + ByteTrack processing
              </span>
            </div>

            <div className="camera-modal-stats">
              <div>
                <small>Detected people</small>
                <strong>{selectedCamera.people}</strong>
              </div>

              <div>
                <small>Processing speed</small>
                <strong>{selectedCamera.fps} FPS</strong>
              </div>

              <div>
                <small>Detection mode</small>
                <strong>{selectedCamera.mode}</strong>
              </div>

              <div>
                <small>Current event</small>
                <strong>{selectedCamera.last_event}</strong>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;