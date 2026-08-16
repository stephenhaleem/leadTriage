/**
 * Reusable lead qualification engine.
 * Input: raw rows from any lead CSV export (column names are fuzzy-matched).
 * Output: cleaned + scored + ranked leads with a recommended action.
 */

export type Action = "contact" | "nurture" | "disqualify";

export interface RawRow {
  [key: string]: string | undefined;
}

export interface ScoredLead {
  leadId: string;
  name: string;
  email: string;
  emailValid: boolean;
  personalEmail: boolean;
  company: string;
  domain: string;
  employees: number | null;
  website: string;
  title: string;
  seniority: "decision-maker" | "influencer" | "junior" | "unknown";
  source: string;
  budget: number | null;
  budgetLabel: string;
  createdISO: string | null;
  notes: string;
  intent: number;
  fit: number;
  budgetScore: number;
  score: number;
  action: Action;
  reasons: string[];
  flags: string[];
  duplicateOf?: string;
}

/* ------------------------------- cleaning ------------------------------- */

const clean = (v?: string) => (v ?? "").replace(/\s+/g, " ").trim();

const HEADER_ALIASES: Record<string, string[]> = {
  leadId: ["lead_id", "leadid", "id"],
  created: ["created", "created_at", "date", "createddate"],
  name: ["name", "full_name", "contact"],
  email: ["email", "email_address"],
  company: ["company", "company_name", "account"],
  employees: ["employees", "company_size", "headcount", "size"],
  website: ["website", "url", "domain"],
  title: ["title", "job_title", "role", "position"],
  source: ["source", "channel", "lead_source"],
  budget: ["monthly_budget", "budget", "spend"],
  notes: ["notes", "note", "comments", "message"],
};

export interface MappedRow {
  leadId: string; created: string; name: string; email: string; company: string;
  employees: string; website: string; title: string; source: string; budget: string; notes: string;
}

export function mapRow(row: RawRow): MappedRow {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    lower[k.toLowerCase().replace(/[\s-]+/g, "_")] = clean(v);
  }
  const pick = (field: string) =>
    (HEADER_ALIASES[field] ?? []).map((a) => lower[a]).find((v) => v) ?? "";
  return {
    leadId: pick("leadId"), created: pick("created"), name: pick("name"), email: pick("email"),
    company: pick("company"), employees: pick("employees"), website: pick("website"),
    title: pick("title"), source: pick("source"), budget: pick("budget"), notes: pick("notes"),
  };
}

const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

export function parseDate(raw: string): string | null {
  const s = clean(raw);
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]!}-${iso[2]!}-${iso[3]!}`;
  const named = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const m = MONTHS.indexOf(named[1]!.slice(0, 3).toLowerCase());
    if (m >= 0) return `${named[3]!}-${pad(m + 1)}-${pad(+named[2]!)}`;
  }
  const parts = s.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (parts) {
    const a = parts[1]!, b = parts[2]!, c = parts[3]!;
    let year: number, month: number, day: number;
    if (a.length === 4) {
      year = +a; month = +b; day = +c;
    } else {
      day = +a; month = +b;
      // ambiguous: default US m/d/y unless first part must be a day
      if (+a <= 12 && +b <= 12) { month = +a; day = +b; }
      year = +c < 100 ? 2000 + +c : +c;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  return null;
}
const pad = (n: number) => String(n).padStart(2, "0");

export function parseEmployees(raw: string): number | null {
  const s = clean(raw).toLowerCase();
  if (!s) return null;
  const range = s.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return Math.round((+range[1]! + +range[2]!) / 2);
  const n = s.match(/(\d+)/);
  return n ? +n[1]! : null;
}

/** Returns monthly budget in currency units, or null when unknown. */
export function parseBudget(raw: string): number | null {
  const s = clean(raw).toLowerCase();
  if (!s || /tbd|depends|unknown|n\/a|not sure|\?/.test(s)) return null;
  const nums = [...s.matchAll(/(\d[\d,.]*)\s*(k)?/g)]
    .map((m) => {
      const base = parseFloat(m[1]!.replace(/,/g, ""));
      if (Number.isNaN(base)) return null;
      return m[2] === "k" ? base * 1000 : base;
    })
    .filter((n): n is number => n !== null);
  if (!nums.length) return null;
  // "5k-7k" or "6-8k" -> use the low end, conservative
  let value = Math.min(...nums);
  // "6-8k": bare low end next to a k-suffixed high end
  if (nums.length > 1 && Math.max(...nums) >= 1000 && value < 100) value *= 1000;
  return value;
}

export function normalizeDomain(website: string, email: string): string {
  const w = clean(website).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (w) return w;
  const e = email.split("@")[1];
  return e ? e.toLowerCase() : "";
}

const FREE_EMAIL = ["gmail.com", "yahoo.com", "proton.me", "protonmail.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const DECISION_MAKER = ["founder", "ceo", "owner", "coo", "managing director", "managing partner", "cmo", "partner", "president", "md"];
const INFLUENCER = ["head of", "vp", "director", "lead", "manager"];
const JUNIOR = ["student", "intern", "freelancer", "analyst", "assistant"];

export function titleCase(s: string) {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

/* ------------------------------- signals -------------------------------- */

interface Signal { re: RegExp; label: string }

const DISQUALIFIERS: Signal[] = [
  { re: /you have won|click here to claim|crypto|viagra|\bseo services\b.*cheap/i, label: "Spam content" },
  { re: /looking for a role|attaching my cv|my resume|job application|hire me/i, label: "Job seeker" },
  { re: /\bstudent\b|just learning|free template|not looking to buy/i, label: "Not a buyer" },
  { re: /journalist|writing about|press|podcast guest|for a quote/i, label: "Media / press" },
  { re: /\bvc here\b|intro you to a few portfolio|not a direct buyer/i, label: "Investor / partner intro" },
  { re: /not an agency|budget way below|can'?t really pay|no budget/i, label: "Out of ICP / no budget" },
  { re: /test lead|ignore this|asdf|lorem ipsum/i, label: "Test record" },
];

const INTENT_POSITIVE: Signal[] = [
  { re: /want it automated end to end|ready to pilot|start asap|move fast|keen to move fast|this quarter/i, label: "Explicit buying urgency" },
  { re: /budget approved|budget is approved|approved budget/i, label: "Budget approved" },
  { re: /is eating our week|eating our week|manually|by hand|one by one|going stale|go stale/i, label: "Named operational pain" },
  { re: /interested in automating|exploring automating|looking into automating|curious about automating/i, label: "Automation use case" },
  { re: /this is my priority|i make the call|i decide|final say/i, label: "Stated authority" },
  { re: /next 2 weeks|next two weeks|in the next \d+ weeks?|immediately/i, label: "Near-term timeline" },
];

const INTENT_NEGATIVE: Signal[] = [
  { re: /price sensitive|cheap|discount/i, label: "Price sensitive" },
  { re: /comparing a few options|evaluating vendors/i, label: "Early-stage comparison" },
  { re: /budget not locked|not locked yet|no timeline|decision in about a month|maybe later|next year/i, label: "Soft timeline" },
  { re: /just curious|just browsing|kicking the tyres|kicking the tires/i, label: "Low intent language" },
];

const ICP_HINTS = /agency|marketing|media buying|influencer|creative studio|consultancy|revops|growth/i;

/* -------------------------------- scoring -------------------------------- */

export interface Thresholds {
  contact: number;
  nurture: number;
  minBudget: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { contact: 70, nurture: 45, minBudget: 3000 };

function scoreLead(m: MappedRow, t: Thresholds): ScoredLead {
  const email = clean(m.email).toLowerCase();
  const emailValid = EMAIL_RE.test(email);
  const domain = normalizeDomain(m.website, email);
  const personalEmail = FREE_EMAIL.includes(email.split("@")[1] ?? "");
  const employees = parseEmployees(m.employees);
  const budget = parseBudget(m.budget);
  const notes = clean(m.notes);
  const titleRaw = clean(m.title);
  const title = titleRaw ? titleCase(titleRaw) : "";
  const tl = titleRaw.toLowerCase();
  const source = clean(m.source).toLowerCase() || "unknown";

  const seniority: ScoredLead["seniority"] = JUNIOR.some((k) => tl.includes(k))
    ? "junior"
    : DECISION_MAKER.some((k) => tl === k || tl.includes(k))
      ? "decision-maker"
      : INFLUENCER.some((k) => tl.includes(k))
        ? "influencer"
        : "unknown";

  const reasons: string[] = [];
  const flags: string[] = [];

  /* ---- Intent (0–40) from notes language ---- */
  let intent = 8;
  for (const s of INTENT_POSITIVE) if (s.re.test(notes)) { intent += 7; reasons.push(`+ ${s.label}`); }
  for (const s of INTENT_NEGATIVE) if (s.re.test(notes)) { intent -= 5; reasons.push(`− ${s.label}`); }
  if (!notes) { intent -= 4; flags.push("No notes"); }
  intent = Math.max(0, Math.min(40, intent));

  /* ---- Fit (0–35): ICP, size, seniority, channel ---- */
  let fit = 0;
  const icpText = `${m.company} ${domain} ${notes}`;
  if (ICP_HINTS.test(icpText)) { fit += 10; reasons.push("+ Agency / marketing ICP"); }
  if (employees === null) fit += 4;
  else if (employees >= 10 && employees <= 200) { fit += 12; reasons.push(`+ Team size ${employees} in range`); }
  else if (employees >= 5) fit += 7;
  else { fit += 1; reasons.push(`− Very small team (${employees})`); }
  if (seniority === "decision-maker") { fit += 8; reasons.push("+ Decision-maker contact"); }
  else if (seniority === "influencer") fit += 6;
  else if (seniority === "junior") { fit -= 4; reasons.push("− Junior / non-buyer title"); }
  if (source === "referral") { fit += 5; reasons.push("+ Referral source"); }
  else if (source === "event" || source === "linkedin") fit += 3;
  else if (source === "cold reply") fit += 1;
  if (personalEmail) { fit -= 4; flags.push("Personal email"); }
  fit = Math.max(0, Math.min(35, fit));

  /* ---- Budget (0–25) ---- */
  let budgetScore = 0;
  let budgetLabel = "Unknown";
  if (budget === null) { budgetScore = 8; budgetLabel = "Unknown"; }
  else {
    budgetLabel = `$${budget.toLocaleString()}/mo`;
    if (budget >= t.minBudget * 3) { budgetScore = 25; reasons.push("+ Strong budget"); }
    else if (budget >= t.minBudget * 2) budgetScore = 21;
    else if (budget >= t.minBudget) { budgetScore = 16; reasons.push("+ Budget in range"); }
    else { budgetScore = 2; reasons.push(`− Budget below $${t.minBudget.toLocaleString()} floor`); }
  }

  let score = Math.round(intent + fit + budgetScore);

  /* ---- Hard disqualifiers ---- */
  let disqualified = false;
  for (const d of DISQUALIFIERS) {
    if (d.re.test(notes) || (d.label === "Not a buyer" && seniority === "junior" && !budget)) {
      disqualified = true;
      flags.push(d.label);
    }
  }
  if (!emailValid) { disqualified = true; flags.push("Invalid email"); }

  let action: Action;
  if (disqualified) { action = "disqualify"; score = Math.min(score, 15); }
  else if (score >= t.contact) action = "contact";
  else if (score >= t.nurture) action = "nurture";
  else action = "disqualify";

  return {
    leadId: clean(m.leadId).replace(/^(?!L-)(\d+)$/, "L-$1") || "—",
    name: clean(m.name) ? titleCase(clean(m.name)) : "Unknown",
    email,
    emailValid,
    personalEmail,
    company: clean(m.company) || (domain ? domain.split(".")[0] : "—"),
    domain,
    employees,
    website: clean(m.website),
    title,
    seniority,
    source,
    budget,
    budgetLabel,
    createdISO: parseDate(m.created),
    notes,
    intent,
    fit,
    budgetScore,
    score,
    action,
    reasons,
    flags,
  };
}

export interface PipelineResult {
  leads: ScoredLead[];
  stats: {
    total: number;
    skipped: number;
    duplicates: number;
    contact: number;
    nurture: number;
    disqualify: number;
    avgScore: number;
  };
}

export function runPipeline(rows: RawRow[], t: Thresholds = DEFAULT_THRESHOLDS): PipelineResult {
  const mapped = rows.map(mapRow).filter((m) => Object.values(m).some((v) => v));
  const usable = mapped.filter((m) => m.email || m.company || m.name);
  const skipped = mapped.length - usable.length;

  const scored = usable.map((m) => scoreLead(m, t));

  // de-duplicate on email, then name+company; keep the highest score
  const seen = new Map<string, ScoredLead>();
  let duplicates = 0;
  for (const lead of scored.sort((a, b) => b.score - a.score)) {
    const key = lead.email || `${lead.name}|${lead.company}`.toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      duplicates++;
      lead.duplicateOf = prev.leadId;
      lead.flags.push("Duplicate");
      lead.action = "disqualify";
    } else {
      seen.set(key, lead);
    }
  }

  const leads = scored.sort((a, b) => b.score - a.score || a.company.localeCompare(b.company));
  const count = (a: Action) => leads.filter((l) => l.action === a).length;

  return {
    leads,
    stats: {
      total: leads.length,
      skipped,
      duplicates,
      contact: count("contact"),
      nurture: count("nurture"),
      disqualify: count("disqualify"),
      avgScore: leads.length ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0,
    },
  };
}

export function toCsv(leads: ScoredLead[]): string {
  const cols = [
    "rank", "lead_id", "name", "email", "company", "domain", "employees", "title",
    "seniority", "source", "monthly_budget", "created", "score", "intent", "fit",
    "budget_score", "action", "reasons", "flags",
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.join(",")];
  leads.forEach((l, i) => {
    lines.push([
      i + 1, l.leadId, l.name, l.email, l.company, l.domain, l.employees ?? "", l.title,
      l.seniority, l.source, l.budget ?? "", l.createdISO ?? "", l.score, l.intent, l.fit,
      l.budgetScore, l.action, l.reasons.join("; "), l.flags.join("; "),
    ].map(esc).join(","));
  });
  return lines.join("\n");
}