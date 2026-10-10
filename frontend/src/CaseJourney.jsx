import React from "react";
import { ROLE_LABELS } from "./roles.js";

const stages = [
  ["Identity review", ["identity"]],
  ["Consular and documents", ["consular", "documents"]],
  ["Medical readiness", ["medical", "fitness"]],
  ["Travel preparation", ["permit", "ticket", "transfer"]],
];
const travelLabels = { permit: "Exit permit details", flight: "Flight details", departure: "Departure date and time", transfer: "Airport transfer details" };

export default function CaseJourney({ record }) {
  const tasks = record.tasks || [];
  const pending = tasks.filter(task => !task.done);
  const missingTravel = Object.entries(travelLabels).filter(([key]) => !String(record.travel?.[key] || "").trim());
  const closed = record.status === "Departed";
  const ready = !closed && tasks.length > 0 && !pending.length && !missingTravel.length;
  return <section className="p-card p-case-journey" aria-label="Case journey and departure readiness">
    <div className="p-section-title"><div><p className="p-eyebrow">CASE COORDINATION</p><h2>Admission to departure</h2></div><span className={`p-pill ${ready || closed ? "good" : ""}`}>{closed ? "Case closed" : ready ? "Ready for departure" : "Requirements outstanding"}</span></div>
    <p>Document, medical and travel teams can progress their checks in parallel. All required checks and travel details must be complete before departure.</p>
    <ol className="p-case-stages">
      <li className="complete"><span>01</span><strong>Admission</strong><small>Record registered</small></li>
      {stages.map(([label, ids], index) => {
        const group = tasks.filter(task => ids.includes(task.id));
        const complete = group.length === ids.length && group.every(task => task.done);
        return <li key={label} className={complete ? "complete" : "pending"}><span>{String(index + 2).padStart(2, "0")}</span><strong>{label}</strong><small>{complete ? "Checks complete" : `${group.filter(task => task.done).length} of ${ids.length} complete`}</small></li>;
      })}
      <li className={closed ? "complete" : "pending"}><span>06</span><strong>Departure</strong><small>{closed ? "Case closed" : ready ? "Awaiting authorized closure" : "Awaiting readiness"}</small></li>
    </ol>
    {!closed && <div className="p-case-blockers"><h3>{ready ? "All departure requirements recorded" : "Outstanding departure requirements"}</h3>
      {ready ? <p>The authorized team can review the record and complete departure. Recorded checks do not replace external authority approval.</p> : <ul>
        {pending.map(task => <li key={task.id}><strong>{task.title}</strong><span>{ROLE_LABELS[task.team] || task.team} · {task.owner || "Owner not assigned"} · {task.due ? `Due ${task.due}` : "Deadline not assigned"}{task.escalated ? " · Escalated" : ""}</span></li>)}
        {missingTravel.map(([key, label]) => <li key={key}><strong>{label}</strong><span>Travel Coordinator · Details required</span></li>)}
      </ul>}
    </div>}
  </section>;
}
