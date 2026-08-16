import type { Action, ScoredLead } from "@/lib/lead-engine";

export const actionMeta: Record<Action, { label: string; cls: string }> = {
  contact: {
    label: "Contact now",
    cls: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400 border-emerald-600/40",
  },
  nurture: {
    label: "Nurture",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40",
  },
  disqualify: {
    label: "Disqualify",
    cls: "bg-red-600/15 text-red-700 dark:text-red-400 border-red-600/40",
  },
};
export function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="panel p-5">
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function ScoreBar({ lead }: { lead: ScoredLead }) {
  const seg = [
    { v: lead.intent, max: 40, cls: "bg-primary" },
    { v: lead.fit, max: 35, cls: "bg-info" },
    { v: lead.budgetScore, max: 25, cls: "bg-accent" },
  ];
  return (
    <div className="flex h-1.5 w-28 overflow-hidden rounded-full bg-secondary">
      {seg.map((s, i) => (
        <div key={i} className={s.cls} style={{ width: `${s.v}%` }} />
      ))}
    </div>
  );
}

export function LeadDetail({ lead, onClose }: { lead: ScoredLead; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-background/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{lead.name}</h2>
            <p className="text-sm text-muted-foreground">
              {lead.title || "No title"} · {lead.company}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-secondary"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge className={actionMeta[lead.action].cls}>{actionMeta[lead.action].label}</Badge>
          <Badge className="border-border text-muted-foreground">Score {lead.score}</Badge>
          <Badge className="border-border text-muted-foreground">{lead.source}</Badge>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
          <Field label="Lead ID" value={lead.leadId} />
          <Field label="Created" value={lead.createdISO ?? "unparsed"} />
          <Field label="Email" value={lead.email || "—"} />
          <Field label="Domain" value={lead.domain || "—"} />
          <Field label="Employees" value={lead.employees?.toString() ?? "unknown"} />
          <Field label="Budget" value={lead.budgetLabel} />
          <Field label="Seniority" value={lead.seniority} />
          <Field
            label="Intent / Fit / Budget"
            value={`${lead.intent} / ${lead.fit} / ${lead.budgetScore}`}
          />
        </dl>

        {lead.flags.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Flags</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {lead.flags.map((f) => (
                <Badge key={f} className="border-destructive/40 bg-destructive/10 text-destructive">
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <h3 className="text-sm font-semibold">Why this score</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {lead.reasons.length ? (
              lead.reasons.map((r) => <li key={r}>{r}</li>)
            ) : (
              <li>No strong signals detected.</li>
            )}
          </ul>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold">Original note</h3>
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-secondary/60 p-3 text-sm text-muted-foreground">
            {lead.notes || "—"}
          </p>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}
