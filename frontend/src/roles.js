export const ROLE_LABELS = {
  supervisor: "Shelter Manager",
  security: "Security Officer",
  caseworker: "Case Officer",
  medical: "Medical Team",
  travel: "Travel Coordinator",
  resident: "Resident",
};
export const ROLE_DESCRIPTIONS = {
  supervisor:
    "Oversee the shelter, escalations, departures and employee access.",
  security: "Review recordings, handle incidents and record gate handovers.",
  caseworker:
    "Manage admissions, identity documents, consular requests and resident support.",
  medical: "Review medical needs and complete health and fitness clearances.",
  travel:
    "Arrange permits, flights, airport transfers and departure confirmation.",
  resident: "View your updates, share documents and contact your case officer.",
};
export const DEFAULT_TABS = {
  supervisor: "overview",
  caseworker: "documents",
  medical: "medical",
  travel: "travel",
};
export const ROLE_TABS = {
  supervisor: [
    "overview",
    "checklist",
    "documents",
    "consular",
    "medical",
    "travel",
    "updates",
    "files",
    "messages",
    "audit",
  ],
  caseworker: [
    "overview",
    "checklist",
    "documents",
    "consular",
    "updates",
    "files",
    "messages",
  ],
  medical: ["overview", "checklist", "medical"],
  travel: ["overview", "checklist", "travel", "files"],
};
