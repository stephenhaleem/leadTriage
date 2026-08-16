import { createFileRoute } from "@tanstack/react-router";
import Papa from "papaparse";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DEFAULT_THRESHOLDS,
  runPipeline,
  toCsv,
  type Action,
  type PipelineResult,
  type RawRow,
  type ScoredLead,
  type Thresholds,
} from "@/lib/lead-engine";
import { Badge, LeadDetail, ScoreBar, StatCard, actionMeta } from "@/components/lead-ui";

const TITLE = "LeadTriage — Automated Lead Qualification";
const DESC =
  "Upload any lead export and get cleaned, scored and ranked leads with a contact, nurture or disqualify recommendation for every record.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FILTERS: (Action | "all")[] = ["all", "contact", "nurture", "disqualify"];

function Index() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Action | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ScoredLead | null>(null);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = useCallback((data: RawRow[], t: Thresholds, name: string) => {
    setRows(data);
    setFileName(name);
    setResult(runPipeline(data, t));
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setBusy(true);
      setError("");
      Papa.parse<RawRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          try {
            process(res.data, thresholds, file.name);
          } catch {
            setError("Could not process that file. Check it is a valid CSV export.");
          }
          setBusy(false);
        },
        error: () => {
          setError("Could not read that file.");
          setBusy(false);
        },
      });
    },
    [process, thresholds],
  );

  const loadSample = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const text = await fetch("/sample-leads.csv").then((r) => r.text());
      const res = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
      process(res.data, thresholds, "sample-leads.csv");
    } catch {
      setError("Sample export could not be loaded.");
    }
    setBusy(false);
  }, [process, thresholds]);

  const updateThresholds = (next: Thresholds) => {
    setThresholds(next);
    if (rows) setResult(runPipeline(rows, next));
  };

  const visible = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return result.leads.filter(
      (l) =>
        (filter === "all" || l.action === filter) &&
        (!q ||
          `${l.name} ${l.company} ${l.email} ${l.title} ${l.source} ${l.notes}`
            .toLowerCase()
            .includes(q)),
    );
  }, [result, filter, query]);

  const download = () => {
    if (!result) return;
    const blob = new Blob([toCsv(visible.length ? visible : result.leads)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qualified-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold sm:text-5xl">
            Turn a messy lead export into a ranked call list
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Drop in any CSV of inbound leads. LeadTriage cleans the data, reads the conversation
            notes for intent, scores fit and budget, then tells you who to contact now, who to
            nurture, and who to drop.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <button
              onClick={() => inputRef.current?.click()}
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Upload lead export
            </button>
            <button
              onClick={loadSample}
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-secondary"
            >
              Run the sample export
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            {busy && <span className="text-sm text-primary">Processing…</span>}
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10">
        {!result ? (
          <HowItWorks />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <StatCard
                label="Leads processed"
                value={result.stats.total}
                hint={`${result.stats.duplicates} duplicates merged`}
              />
              <StatCard
                label="Contact now"
                value={result.stats.contact}
                hint={`score ≥ ${thresholds.contact}`}
              />
              <StatCard
                label="Nurture"
                value={result.stats.nurture}
                hint={`score ${thresholds.nurture}–${thresholds.contact - 1}`}
              />
              <StatCard
                label="Disqualified"
                value={result.stats.disqualify}
                hint="spam, non-buyers, out of ICP"
              />
              <StatCard label="Average score" value={result.stats.avgScore} hint="out of 100" />
            </div>

            <div className="panel mt-6 flex flex-wrap items-end gap-6 p-5">
              <Slider
                label="Contact threshold"
                value={thresholds.contact}
                min={50}
                max={95}
                onChange={(v) => updateThresholds({ ...thresholds, contact: v })}
              />
              <Slider
                label="Nurture threshold"
                value={thresholds.nurture}
                min={20}
                max={70}
                onChange={(v) => updateThresholds({ ...thresholds, nurture: v })}
              />
              <Slider
                label="Budget floor ($/mo)"
                value={thresholds.minBudget}
                min={500}
                max={15000}
                step={500}
                onChange={(v) => updateThresholds({ ...thresholds, minBudget: v })}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-1 rounded-lg border border-border p-1">
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-3 py-1.5 text-sm capitalize transition-colors ${
                      filter === f
                        ? "bg-secondary font-semibold"
                        : "text-muted-foreground hover:bg-secondary/60"
                    }`}
                  >
                    {f === "all" ? "All" : actionMeta[f].label}
                  </button>
                ))}
              </div>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, company, note…"
                className="min-w-56 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
              />
              <button
                onClick={download}
                className="rounded-lg border border-primary/50 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                Export ranked CSV
              </button>
            </div>

            <div className="panel mt-4 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Company</th>
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((lead, i) => (
                    <tr
                      key={`${lead.leadId}-${lead.email}-${i}`}
                      onClick={() => setSelected(lead)}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/50"
                    >
                      <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{lead.name}</div>
                        <div className="text-xs text-muted-foreground">{lead.title || "—"}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div>{lead.company}</div>
                        <div className="text-xs text-muted-foreground">{lead.domain || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.employees ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lead.budgetLabel}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{lead.source}</td>
                      <td className="px-4 py-3">
                        <div className="font-display font-semibold">{lead.score}</div>
                        <ScoreBar lead={lead} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={actionMeta[lead.action].cls}>
                          {actionMeta[lead.action].label}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {!visible.length && (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                        No leads match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Score = intent from notes (0–40) + fit: ICP, size, seniority, channel (0–35) + budget
              (0–25). Hard disqualifiers (spam, job seekers, students, press, investors, invalid
              emails, duplicates) override the score.
            </p>
          </>
        )}
      </section>

      {selected && <LeadDetail lead={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="min-w-52 flex-1">
      <span className="flex justify-between text-xs uppercase tracking-wide text-muted-foreground">
        {label} <b className="text-foreground">{value.toLocaleString()}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-[var(--primary)]"
      />
    </label>
  );
}

function HowItWorks() {
  const steps = [
    {
      t: "1. Clean",
      d: 'Normalises IDs, mixed date formats, headcount ranges, websites and messy budget strings like "$6-8k" or "TBD". Invalid emails and duplicates get flagged.',
    },
    {
      t: "2. Read the notes",
      d: "Pattern rules detect buying urgency, approved budget, named pain, authority — and the negatives: price sensitivity, soft timelines, spam, job seekers, students, press and investors.",
    },
    {
      t: "3. Score",
      d: "Intent (40) + fit (35) + budget (25) = a 0–100 score, with hard disqualifiers overriding everything.",
    },
    {
      t: "4. Prioritise",
      d: "Leads are ranked and split into contact now, nurture, or disqualify. Tune thresholds live and export the ranked list as CSV.",
    },
  ];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {steps.map((s) => (
        <div key={s.t} className="panel p-6">
          <h2 className="font-display text-lg font-semibold text-primary">{s.t}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
        </div>
      ))}
    </div>
  );
}
