import type { OpportunityItem } from "@/lib/types";

// Prefixing with a leading apostrophe stops spreadsheet apps (Excel, Sheets)
// from treating a cell starting with =, +, -, @, or tab/CR as a formula.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvCell(value: string): string {
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

const COLUMNS: { header: string; value: (item: OpportunityItem) => string }[] = [
  { header: "Title", value: (i) => i.opportunity.title },
  { header: "University", value: (i) => i.opportunity.university ?? "" },
  { header: "Department", value: (i) => i.opportunity.department ?? "" },
  { header: "Professor", value: (i) => i.opportunity.professor ?? "" },
  { header: "Type", value: (i) => i.opportunity.type.toUpperCase() },
  { header: "Deadline", value: (i) => i.opportunity.deadline ?? "" },
  { header: "Location", value: (i) => i.opportunity.location ?? "" },
  { header: "Stipend", value: (i) => i.opportunity.stipend ?? "" },
  { header: "Status", value: (i) => i.user_note?.status ?? "saved" },
  { header: "Match score", value: (i) => (i.match ? String(Math.round(i.match.score)) : "") },
  { header: "Notes", value: (i) => i.user_note?.note ?? "" },
  { header: "Source URL", value: (i) => i.opportunity.source_url },
];

/** Builds a CSV (opens in Excel) of the given opportunities and triggers a download. */
export function exportOpportunitiesToCsv(items: OpportunityItem[], filename = "pipeline.csv") {
  const rows = [COLUMNS.map((c) => c.header), ...items.map((item) => COLUMNS.map((c) => c.value(item)))];
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
