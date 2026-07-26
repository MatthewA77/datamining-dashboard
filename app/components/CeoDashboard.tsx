/**
 * CeoDashboard — "The Risk Desk" (v2, dual-table)
 * Executive credit-risk briefing for the Home Credit loan portfolio (KDD Phase 1–4, v2).
 *
 * v2 methodology splits the book by OUTCOME first — who repaid (PAID) vs who defaulted
 * (DEFAULT) — clusters each separately (D0–D2, P0–P2), then matches each risky persona to
 * its most-similar safe persona. The finding: in every matched pair the borrower who
 * defaulted looked the same on the loan but carried a LOWER third-party credit score.
 *
 * Signature: a credit-score "gap" dumbbell across the three matched look-alike pairs.
 * Static Server Component; no external UI/chart libraries.
 *
 * Figures trace to v2 outputs: phase2_cluster_profiles.csv · phase3_rules.csv · phase4_anomalies.csv.
 */

const BOOK = {
  customers: 307511,
  defaulters: 24825, // TARGET=1  (8.1%)
  repaid: 282686, // TARGET=0
  defaultRate: 8.07,
  reviewQueue: 3983, // RISK_SIGNAL → manual underwriting
  highValueRare: 26139, // rare-but-legitimate high-value customers
  dataErrors: 0,
};

/* Matched look-alike pairs (Phase 2, cross-population contrast).
   Axis value = EXT_SOURCE_2 (third-party credit score). paid > def in every pair. */
type Pair = {
  key: string;
  profile: [string, string]; // shared loan profile (the thing held equal)
  paid: { id: string; v: number };
  def: { id: string; v: number };
  dScore: string;
  dAge: string;
};
const PAIRS: Pair[] = [
  {
    key: "small",
    profile: ["Small, conservative loans", "credit-to-income ≈ 2"],
    paid: { id: "P1", v: 0.496 },
    def: { id: "D0", v: 0.367 },
    dScore: "−0.13",
    dAge: "−5 yr",
  },
  {
    key: "levered",
    profile: ["Over-leveraged", "credit-to-income ≈ 6–7"],
    paid: { id: "P0", v: 0.519 },
    def: { id: "D1", v: 0.408 },
    dScore: "−0.11",
    dAge: "−4 yr",
  },
  {
    key: "affluent",
    profile: ["Affluent, large loans", "credit-to-income ≈ 3.5"],
    paid: { id: "P2", v: 0.558 },
    def: { id: "D2", v: 0.460 },
    dScore: "−0.10",
    dAge: "−1 yr",
  },
];

type Persona = { id: string; name: string; sharePop: number; score: number; trait: string };
const DEFAULT_PERSONAS: Persona[] = [
  { id: "D0", name: "Young, small loan, weak score", sharePop: 35.2, score: 0.37, trait: "Youngest (38 yrs); smallest loans; lowest external scores." },
  { id: "D1", name: "Over-leveraged", sharePop: 30.5, score: 0.41, trait: "Low income, large credit — highest credit-to-income (6.4×)." },
  { id: "D2", name: "Mid-income, low EXT3", sharePop: 34.3, score: 0.46, trait: "Higher income, affordable loan, but weakest EXT_SOURCE_3." },
];
const PAID_PERSONAS: Persona[] = [
  { id: "P0", name: "Established, leveraged, strong score", sharePop: 29.0, score: 0.52, trait: "Oldest (48 yrs), longest tenure, high leverage — but strong scores." },
  { id: "P1", name: "Conservative, small loan", sharePop: 37.0, score: 0.50, trait: "Smallest loans (ratio 2.0); solid external scores." },
  { id: "P2", name: "Affluent, high income", sharePop: 34.0, score: 0.56, trait: "Highest income, big affordable credit, top EXT_SOURCE_2." },
];

const RISK_DRIVERS = [
  { label: "Both external credit scores low", prob: 18.4, lift: 2.3 },
  { label: "Short tenure (1–3 yrs) + low score", prob: 17.1, lift: 2.1 },
  { label: "Low score, male borrowers", prob: 16.4, lift: 2.0 },
  { label: "Young age + low score", prob: 16.0, lift: 2.0 },
];
const PROTECTIVE = [
  { label: "Both external scores high", repaid: 97.7, note: "covers ~12% of the book" },
  { label: "High score + top-rated region", repaid: 97.8, note: "" },
  { label: "15+ yrs employed + high score", repaid: 97.6, note: "" },
];

const fmt = (n: number) => n.toLocaleString("en-US");

/* ---------- Signature: credit-score gap dumbbell ---------- */

const W = 860;
const H = 240;
const AX0 = 210; // axis left (value 0.30)
const AX1 = 720; // axis right (value 0.60)
const V_MIN = 0.3;
const V_MAX = 0.6;
const xOf = (v: number) => AX0 + ((v - V_MIN) / (V_MAX - V_MIN)) * (AX1 - AX0);
const ROW_Y = [64, 118, 172];
const AXIS_Y = 198;
const TICKS = [0.3, 0.4, 0.5, 0.6];

const SAFE = "#35D6A0";
const RISK = "#F0685A";

function ScoreGap() {
  return (
    <svg
      className="rd-gap"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Credit-score gap across three matched look-alike pairs. In every pair the borrower who defaulted has a lower third-party credit score than the one who repaid."
    >
      {/* legend */}
      <circle cx={AX0} cy="22" r="6" fill={SAFE} />
      <text x={AX0 + 12} y="26" className="rd-svg-legend" textAnchor="start">
        Repaid look-alike
      </text>
      <circle cx={AX0 + 165} cy="22" r="6" fill={RISK} />
      <text x={AX0 + 177} y="26" className="rd-svg-legend" textAnchor="start">
        Defaulted
      </text>

      {/* axis */}
      <line x1={AX0} y1={AXIS_Y} x2={AX1} y2={AXIS_Y} className="rd-svg-axis" />
      {TICKS.map((t) => (
        <g key={t}>
          <line x1={xOf(t)} y1={AXIS_Y} x2={xOf(t)} y2={AXIS_Y + 6} className="rd-svg-axis" />
          <text x={xOf(t)} y={AXIS_Y + 20} className="rd-svg-tick" textAnchor="middle">
            {t.toFixed(2)}
          </text>
        </g>
      ))}
      <text x={AX0} y={H - 6} className="rd-svg-axislabel" textAnchor="start">
        THIRD-PARTY CREDIT SCORE (EXT_SOURCE_2) — HIGHER IS SAFER →
      </text>

      {/* pairs */}
      {PAIRS.map((p, i) => {
        const y = ROW_Y[i];
        const xd = xOf(p.def.v);
        const xp = xOf(p.paid.v);
        return (
          <g key={p.key}>
            {/* shared profile (held equal) */}
            <text x={AX0 - 16} y={y - 3} className="rd-svg-prof" textAnchor="end">
              {p.profile[0]}
            </text>
            <text x={AX0 - 16} y={y + 12} className="rd-svg-profsub" textAnchor="end">
              {p.profile[1]}
            </text>

            {/* connector + dots */}
            <line x1={xd} y1={y} x2={xp} y2={y} className="rd-svg-conn" />
            <circle cx={xd} cy={y} r="8" fill={RISK} stroke="#0E0F13" strokeWidth="2" />
            <circle cx={xp} cy={y} r="8" fill={SAFE} stroke="#0E0F13" strokeWidth="2" />
            <text x={xd - 14} y={y + 4} className="rd-svg-dotval" textAnchor="end" fill={RISK}>
              {p.def.v.toFixed(2)}
            </text>
            <text x={xp + 14} y={y + 4} className="rd-svg-dotval" textAnchor="start" fill={SAFE}>
              {p.paid.v.toFixed(2)}
            </text>

            {/* delta */}
            <text x={W - 14} y={y - 3} className="rd-svg-delta" textAnchor="end">
              {p.dScore} score
            </text>
            <text x={W - 14} y={y + 12} className="rd-svg-deltasub" textAnchor="end">
              {p.dAge} age
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- Bars ---------- */

function Bar({
  label,
  value,
  caption,
  color,
  scaleMax,
}: {
  label: string;
  value: number;
  caption: string;
  color: string;
  scaleMax: number;
}) {
  return (
    <li className="rd-bar">
      <div className="rd-bar-head">
        <span className="rd-bar-label">{label}</span>
        <span className="rd-bar-val" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="rd-track">
        <span className="rd-fill" style={{ width: `${(value / scaleMax) * 100}%`, background: color }} />
      </div>
      {caption ? <div className="rd-bar-cap">{caption}</div> : null}
    </li>
  );
}

function PersonaBlock({
  heading,
  count,
  personas,
  color,
}: {
  heading: string;
  count: number;
  personas: Persona[];
  color: string;
}) {
  return (
    <div className="rd-book">
      <div className="rd-book-head">
        <span className="rd-book-title" style={{ color }}>
          {heading}
        </span>
        <span className="rd-book-count">{fmt(count)} borrowers</span>
      </div>
      {personas.map((p) => (
        <div key={p.id} className="rd-prow">
          <span className="rd-dot" style={{ background: color }} aria-hidden="true" />
          <div className="rd-prow-name">
            {p.name}
            <span className="rd-prow-trait">{p.trait}</span>
          </div>
          <div className="rd-prow-num">
            <span className="rd-num">{p.sharePop}%</span>
            <span className="rd-prow-cap">of {heading === "Repaid" ? "payers" : "defaulters"}</span>
          </div>
          <div className="rd-prow-num">
            <span className="rd-num" style={{ color }}>
              {p.score.toFixed(2)}
            </span>
            <span className="rd-prow-cap">score</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Page ---------- */

export default function CeoDashboard() {
  return (
    <div className="rd">
      <style>{styles}</style>

      <div className="rd-wrap">
        {/* Masthead */}
        <header className="rd-mast rd-rise">
          <div>
            <div className="rd-eyebrow">Credit Risk Desk · Portfolio Briefing</div>
            <h1 className="rd-h1">
              Same loan, different outcome — <span className="rd-h1-em">what separates them.</span>
            </h1>
            <p className="rd-lede">
              {fmt(BOOK.customers)} borrowers, split into who repaid and who defaulted, then matched
              look-alike for look-alike.
            </p>
          </div>
          <div className="rd-mast-stat">
            <div className="rd-mast-num">{fmt(BOOK.customers)}</div>
            <div className="rd-mast-cap">borrowers on book</div>
          </div>
        </header>

        {/* Signature: credit-score gap */}
        <section className="rd-panel rd-panel-hero rd-rise" style={{ animationDelay: "60ms" }}>
          <div className="rd-panel-head">
            <span className="rd-eyebrow">The credit-score gap</span>
            <span className="rd-panel-note">three matched pairs · same loan profile, different score</span>
          </div>
          <ScoreGap />
        </section>

        {/* KPI band */}
        <section className="rd-kpis rd-rise" style={{ animationDelay: "120ms" }}>
          <div className="rd-kpi">
            <div className="rd-kpi-label">Portfolio default</div>
            <div className="rd-kpi-num">{BOOK.defaultRate}%</div>
            <div className="rd-kpi-sub">{fmt(BOOK.defaulters)} of {fmt(BOOK.customers)} borrowers</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-label">Repaid</div>
            <div className="rd-kpi-num" style={{ color: SAFE }}>
              {fmt(BOOK.repaid)}
            </div>
            <div className="rd-kpi-sub">91.9% of the book</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-label">Defaulted</div>
            <div className="rd-kpi-num" style={{ color: RISK }}>
              {fmt(BOOK.defaulters)}
            </div>
            <div className="rd-kpi-sub">8.1% — the book we dissect</div>
          </div>
          <div className="rd-kpi">
            <div className="rd-kpi-label">Review queue</div>
            <div className="rd-kpi-num" style={{ color: "#F3C24B" }}>
              {fmt(BOOK.reviewQueue)}
            </div>
            <div className="rd-kpi-sub">high-leverage accounts to escalate</div>
          </div>
        </section>

        {/* The one lever */}
        <section className="rd-lever rd-rise" style={{ animationDelay: "180ms" }}>
          <div className="rd-eyebrow rd-eyebrow-gold">The one lever</div>
          <p className="rd-lever-text">
            Across every matched pair, the borrower who defaulted looked the same on the loan — same
            size, same leverage — but carried a lower <em>third-party credit score</em>, and was
            usually younger. That score, not income or loan size, is the sharpest{" "}
            <strong>tell</strong>.
          </p>
        </section>

        {/* Drivers vs protectors */}
        <section className="rd-duo rd-rise" style={{ animationDelay: "240ms" }}>
          <div className="rd-panel">
            <div className="rd-panel-head">
              <span className="rd-eyebrow">What drives defaults</span>
              <span className="rd-panel-note">chance of default when present</span>
            </div>
            <ul className="rd-bars">
              {RISK_DRIVERS.map((d) => (
                <Bar
                  key={d.label}
                  label={d.label}
                  value={d.prob}
                  caption={`${d.lift}× the average default rate`}
                  color={RISK}
                  scaleMax={20}
                />
              ))}
            </ul>
          </div>
          <div className="rd-panel">
            <div className="rd-panel-head">
              <span className="rd-eyebrow">What holds the book</span>
              <span className="rd-panel-note">chance of repayment when present</span>
            </div>
            <ul className="rd-bars">
              {PROTECTIVE.map((p) => (
                <Bar
                  key={p.label}
                  label={p.label}
                  value={p.repaid}
                  caption={p.note}
                  color={SAFE}
                  scaleMax={100}
                />
              ))}
            </ul>
          </div>
        </section>

        {/* Persona ledger — two books */}
        <section className="rd-panel rd-rise" style={{ animationDelay: "300ms" }}>
          <div className="rd-panel-head">
            <span className="rd-eyebrow">Persona ledger</span>
            <span className="rd-panel-note">six archetypes across two books</span>
          </div>
          <div className="rd-books">
            <PersonaBlock heading="Repaid" count={BOOK.repaid} personas={PAID_PERSONAS} color={SAFE} />
            <PersonaBlock heading="Defaulted" count={BOOK.defaulters} personas={DEFAULT_PERSONAS} color={RISK} />
          </div>
        </section>

        {/* Signals */}
        <section className="rd-signals rd-rise" style={{ animationDelay: "360ms" }}>
          <div className="rd-signal">
            <div className="rd-signal-num" style={{ color: "#F3C24B" }}>
              {fmt(BOOK.reviewQueue)}
            </div>
            <div className="rd-signal-label">Risk signals</div>
            <div className="rd-signal-note">
              Leverage a median 10.5× income; default 8.7% &gt; average → manual underwriting.
            </div>
          </div>
          <div className="rd-signal">
            <div className="rd-signal-num" style={{ color: SAFE }}>
              {fmt(BOOK.highValueRare)}
            </div>
            <div className="rd-signal-label">High-value, keep</div>
            <div className="rd-signal-note">
              Unusual but sound; default 5.2% &lt; average → special approval lane, not a reject.
            </div>
          </div>
          <div className="rd-signal">
            <div className="rd-signal-num">{BOOK.dataErrors}</div>
            <div className="rd-signal-label">Data errors</div>
            <div className="rd-signal-note">
              Eleven integrity checks pass — the book is clean, the read is reliable.
            </div>
          </div>
        </section>

        <footer className="rd-foot">
          KDD analysis of the Home Credit dataset (v2). Segmentation splits the book by outcome —
          repaid vs defaulted — clusters each separately, then matches look-alikes across the two;
          the differentiator is the third-party credit score. Association-rule mining (Apriori) and
          anomaly detection (IQR · Z-score · Isolation Forest) corroborate it. Figures trace to Phase
          1–4 outputs.
        </footer>
      </div>
    </div>
  );
}

/* ---------- Styles (namespaced under .rd) ---------- */

const styles = `
.rd{
  --desk:#0E0F13; --panel:#15171E; --panel-2:#191C24; --hair:#272B35;
  --bone:#E8E5DB; --muted:#868C99; --gold:#E3B341;
  --display:var(--font-display),"Space Grotesk",system-ui,sans-serif;
  --body:var(--font-geist-sans),system-ui,sans-serif;
  --mono:var(--font-geist-mono),ui-monospace,"SFMono-Regular",monospace;
  min-height:100vh; background:var(--desk); color:var(--bone); font-family:var(--body);
}
.rd *{box-sizing:border-box;}
.rd-wrap{max-width:1120px; margin:0 auto; padding:40px 24px 56px;}

.rd-rise{opacity:0; transform:translateY(10px); animation:rd-rise .6s cubic-bezier(.22,.61,.36,1) forwards;}
@keyframes rd-rise{to{opacity:1; transform:none;}}
@media (prefers-reduced-motion: reduce){ .rd-rise{animation:none; opacity:1; transform:none;} }
.rd :focus-visible{outline:2px solid var(--gold); outline-offset:3px; border-radius:4px;}

/* masthead */
.rd-mast{display:flex; justify-content:space-between; align-items:flex-end; gap:28px; flex-wrap:wrap; margin-bottom:8px;}
.rd-eyebrow{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--gold);}
.rd-eyebrow-gold{color:var(--gold);}
.rd-h1{font-family:var(--display); font-weight:600; font-size:clamp(27px,4.2vw,42px); line-height:1.05; letter-spacing:-.02em; margin:12px 0 10px; color:var(--bone);}
.rd-h1-em{color:var(--muted); font-weight:500;}
.rd-lede{margin:0; max-width:56ch; font-size:15px; line-height:1.5; color:var(--muted);}
.rd-mast-stat{text-align:right; padding-left:20px; border-left:1px solid var(--hair);}
.rd-mast-num{font-family:var(--mono); font-size:30px; font-weight:500; letter-spacing:-.02em; color:var(--bone); font-variant-numeric:tabular-nums;}
.rd-mast-cap{font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin-top:3px;}

/* panels */
.rd-panel{background:var(--panel); border:1px solid var(--hair); border-radius:16px; padding:20px 22px;}
.rd-panel, .rd-kpis, .rd-lever, .rd-duo, .rd-signals{margin-top:16px;}
.rd-panel-hero{padding:22px 22px 14px;}
.rd-panel-head{display:flex; align-items:baseline; justify-content:space-between; gap:14px; margin-bottom:14px;}
.rd-panel-note{font-family:var(--mono); font-size:10.5px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted);}

/* dumbbell svg */
.rd-gap{width:100%; height:auto; display:block; overflow:visible;}
.rd-svg-legend{font-family:var(--mono); font-size:11px; letter-spacing:.06em; fill:var(--bone); text-transform:uppercase;}
.rd-svg-axis{stroke:var(--hair); stroke-width:1.2;}
.rd-svg-tick{font-family:var(--mono); font-size:11px; fill:var(--muted);}
.rd-svg-axislabel{font-family:var(--mono); font-size:10px; letter-spacing:.1em; fill:var(--muted);}
.rd-svg-prof{font-family:var(--display); font-size:14px; font-weight:600; fill:var(--bone);}
.rd-svg-profsub{font-family:var(--mono); font-size:10.5px; letter-spacing:.03em; fill:var(--muted);}
.rd-svg-conn{stroke:#3A3F4A; stroke-width:2;}
.rd-svg-dotval{font-family:var(--mono); font-size:13px; font-weight:600; font-variant-numeric:tabular-nums;}
.rd-svg-delta{font-family:var(--mono); font-size:13px; font-weight:600; fill:var(--gold); font-variant-numeric:tabular-nums;}
.rd-svg-deltasub{font-family:var(--mono); font-size:10.5px; fill:var(--muted); font-variant-numeric:tabular-nums;}

/* kpi band */
.rd-kpis{display:grid; grid-template-columns:repeat(4,1fr); background:var(--panel); border:1px solid var(--hair); border-radius:16px; overflow:hidden;}
.rd-kpi{padding:18px 20px; border-left:1px solid var(--hair);}
.rd-kpi:first-child{border-left:none;}
.rd-kpi-label{font-family:var(--mono); font-size:10.5px; letter-spacing:.13em; text-transform:uppercase; color:var(--muted);}
.rd-kpi-num{font-family:var(--mono); font-size:30px; font-weight:600; letter-spacing:-.02em; color:var(--bone); margin-top:8px; font-variant-numeric:tabular-nums;}
.rd-kpi-sub{font-size:12px; color:var(--muted); margin-top:6px; line-height:1.35;}

/* one lever */
.rd-lever{background:linear-gradient(180deg,#191C24,#141620); border:1px solid var(--hair); border-radius:16px; padding:22px 24px;}
.rd-lever-text{font-family:var(--display); font-weight:400; font-size:clamp(17px,2.3vw,22px); line-height:1.42; letter-spacing:-.01em; color:var(--bone); margin:12px 0 0; max-width:72ch;}
.rd-lever-text em{font-style:normal; color:var(--gold);}
.rd-lever-text strong{color:var(--bone); font-weight:700;}

/* duo */
.rd-duo{display:grid; grid-template-columns:1fr 1fr; gap:16px;}
.rd-duo > .rd-panel{margin-top:0;}
.rd-bars{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:15px;}
.rd-bar-head{display:flex; justify-content:space-between; align-items:baseline; gap:12px;}
.rd-bar-label{font-size:13.5px; color:var(--bone);}
.rd-bar-val{font-family:var(--mono); font-size:14px; font-weight:600; font-variant-numeric:tabular-nums;}
.rd-track{height:6px; margin-top:8px; border-radius:99px; background:#0E0F13; border:1px solid var(--hair); overflow:hidden;}
.rd-fill{display:block; height:100%; border-radius:99px;}
.rd-bar-cap{font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; color:var(--muted); margin-top:6px; text-transform:uppercase;}

/* persona ledger — two books */
.rd-books{display:grid; grid-template-columns:1fr 1fr; gap:22px;}
.rd-book-head{display:flex; align-items:baseline; justify-content:space-between; gap:10px; padding-bottom:10px; border-bottom:1px solid var(--hair); margin-bottom:4px;}
.rd-book-title{font-family:var(--display); font-weight:600; font-size:15px;}
.rd-book-count{font-family:var(--mono); font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted);}
.rd-prow{display:grid; grid-template-columns:11px 1fr 60px 52px; align-items:start; gap:12px; padding:12px 0; border-top:1px solid var(--hair);}
.rd-prow:first-of-type{border-top:none;}
.rd-dot{width:11px; height:11px; border-radius:50%; margin-top:4px;}
.rd-prow-name{font-family:var(--display); font-weight:600; font-size:13.5px; color:var(--bone); line-height:1.25;}
.rd-prow-trait{display:block; font-family:var(--body); font-weight:400; font-size:11.5px; color:var(--muted); margin-top:3px;}
.rd-prow-num{text-align:right;}
.rd-num{font-family:var(--mono); font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; display:block; color:var(--bone);}
.rd-prow-cap{font-family:var(--mono); font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted);}

/* signals */
.rd-signals{display:grid; grid-template-columns:repeat(3,1fr); gap:16px;}
.rd-signal{background:var(--panel); border:1px solid var(--hair); border-radius:16px; padding:18px 20px;}
.rd-signal-num{font-family:var(--mono); font-size:26px; font-weight:600; letter-spacing:-.02em; color:var(--bone); font-variant-numeric:tabular-nums;}
.rd-signal-label{font-family:var(--display); font-weight:600; font-size:14px; margin-top:4px; color:var(--bone);}
.rd-signal-note{font-size:12px; color:var(--muted); margin-top:8px; line-height:1.45;}

/* footer */
.rd-foot{font-family:var(--mono); font-size:10.5px; letter-spacing:.04em; line-height:1.6; color:var(--muted); margin-top:24px; max-width:92ch;}

/* responsive */
@media (max-width:860px){
  .rd-kpis{grid-template-columns:1fr 1fr;}
  .rd-kpi:nth-child(3){border-left:none;}
  .rd-kpi:nth-child(-n+2){border-bottom:1px solid var(--hair);}
  .rd-duo{grid-template-columns:1fr;}
  .rd-books{grid-template-columns:1fr; gap:8px;}
  .rd-signals{grid-template-columns:1fr;}
}
@media (max-width:520px){
  .rd-wrap{padding:28px 16px 40px;}
  .rd-kpis{grid-template-columns:1fr;}
  .rd-kpi{border-left:none; border-top:1px solid var(--hair);}
  .rd-kpi:first-child{border-top:none;}
  .rd-mast-stat{padding-left:0; border-left:none;}
}
`;
