import { ChevronLeft, ChevronRight } from "lucide-react";

// Reusable server-side pager: page-size selector (25/50/100) + Prev/Next.
// Controlled via skip/limit/total. onSkip(newSkip), onLimit(newLimit).
export default function Pager({ skip, limit, total, onSkip, onLimit, sizes = [25, 50, 100] }) {
  const from = total === 0 ? 0 : skip + 1;
  const to = Math.min(skip + limit, total);
  const canPrev = skip > 0;
  const canNext = skip + limit < total;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }} data-testid="pager">
      {onLimit && (
        <select className="input" style={{ maxWidth: 120 }} value={limit} data-testid="pager-size"
          onChange={(e) => onLimit(Number(e.target.value))}>
          {sizes.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>
      )}
      <span className="muted" style={{ fontSize: 13 }} data-testid="pager-range">{from}–{to} of {total}</span>
      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <button className="btn btn-ghost btn-sm" disabled={!canPrev} data-testid="pager-prev"
          onClick={() => onSkip(Math.max(0, skip - limit))}><ChevronLeft size={16} /> Prev</button>
        <button className="btn btn-ghost btn-sm" disabled={!canNext} data-testid="pager-next"
          onClick={() => onSkip(skip + limit)}>Next <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
