import React from "react";
import { ArrowUpRight, ArrowRight, ClipboardList, FileText, HeartPulse, Plane, Clock, ShieldCheck } from "lucide-react";
import { ROLE_LABELS } from "./roles.js";

const departments = [
  ["caseworker", "Identity and documents", FileText],
  ["medical", "Medical readiness", HeartPulse],
  ["travel", "Travel and departure", Plane],
];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export default function OperationsOverview({ records, user, onOpen, onNavigate, onAdmit }) {
  const active = records.filter(record => record.status !== "Departed");
  const tasks = active.flatMap(record => record.tasks.filter(task => !task.done).map(task => ({ ...task, record })));
  const urgent = tasks.filter(task => task.escalated || (task.due && task.due < today())).sort((a, b) => Number(b.escalated) - Number(a.escalated) || (a.due || "9999").localeCompare(b.due || "9999"));
  const ready = active.filter(record => record.tasks.length && record.tasks.every(task => task.done) && Object.values(record.travel).every(value => String(value).trim()));
  return <div className="p-operations">
    <section className="p-operations-hero">
      <div><p className="p-eyebrow">AL AWIR · OPERATIONS CENTRE</p><h2>Every case has<br/><em>a next step.</em></h2><p>Bring teams, resident support and departure readiness into one coordinated view.</p><div className="p-hero-actions"><button className="p-primary" onClick={onAdmit}><ClipboardList size={17}/> Register an admission</button><button className="p-secondary" onClick={() => onNavigate("tasks")} >Open team queue <ArrowUpRight size={17}/></button></div></div>
      <div className="p-hero-summary"><span className="p-summary-icon"><ShieldCheck size={28}/></span><span>DEPARTURE READINESS</span><strong>{ready.length}<small> / {active.length}</small></strong><p>active cases have all required checks and travel details recorded</p><button onClick={() => onNavigate("departures", "Ready")}>Review departures <ArrowRight size={17}/></button></div>
    </section>
    <div className="p-overview-grid">
      <section className="p-card p-attention"><div className="p-section-title"><div><p className="p-eyebrow">PRIORITY WORK</p><h2>Needs attention</h2></div><span className="p-pill">{urgent.length} checks</span></div>
        {!urgent.length ? <div className="p-empty-state"><ShieldCheck size={30}/><h3>No overdue or escalated checks</h3><p>{active.length ? "Pending work remains available in the team queue." : "Register an admission to begin coordinating a resident’s case."}</p><button className="p-open" onClick={() => active.length ? onNavigate("tasks") : onAdmit()}>{active.length ? "View pending work" : "Register first admission"} <ArrowRight size={16}/></button></div> : urgent.slice(0, 5).map(task => <button className="p-attention-row" key={task.record.id + task.id} onClick={() => onOpen(task.record, "checklist")}><span className="p-attention-dot"/><span><strong>{task.title}</strong><small>{task.record.name} · {task.owner || "Unassigned"}</small></span><span className="p-attention-meta"><b>{task.escalated ? "Escalated" : "Overdue"}</b><small>{task.due || "Set deadline"}</small></span><ArrowUpRight size={17}/></button>)}
        {urgent.length > 5 && <button className="p-open" onClick={() => onNavigate("tasks")}>View all {urgent.length} priority checks <ArrowRight size={16}/></button>}
      </section>
      <section className="p-card p-departments"><div className="p-section-title"><div><p className="p-eyebrow">SHARED RESPONSIBILITY</p><h2>Team readiness</h2></div><Clock size={20}/></div>
        {departments.map(([role, label, Icon]) => { const checks = active.flatMap(record => record.tasks.filter(task => task.team === role)); const done = checks.filter(task => task.done).length; const percent = checks.length ? Math.round(done / checks.length * 100) : 0; return <div className="p-department" key={role}><div><span className="p-department-icon"><Icon size={19}/></span><span><strong>{label}</strong><small>{ROLE_LABELS[role]}</small></span><b>{done}<small> / {checks.length}</small></b></div><div className="p-readiness-bar" role="progressbar" aria-label={`${label} checks complete`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={checks.length || 1}><span style={{width: `${percent}%`}}/></div></div>; })}
        <p className="p-help">Completed checks across active cases. Each team retains responsibility for its own clearance.</p>
      </section>
    </div>
    <section className="p-service-strip" aria-label="Operational services">
      {[["cases", "Resident records", "Identity, documents and case history", FileText], ["departures", "Departure planning", "Permits, flights and airport transfers", Plane], ["monitoring", "Safety operations", "Video review and incident response", ShieldCheck]].map(([page, label, text, Icon]) => <button key={page} onClick={() => onNavigate(page)}><Icon size={24}/><span><strong>{label}</strong><small>{text}</small></span><ArrowUpRight size={19}/></button>)}
    </section>
  </div>;
}
