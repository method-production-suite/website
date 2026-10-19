// Method Budget's act: the schedule's numbers (shoot days, cast days, locations) come
// across, each one sending budget lines flying into the detail with its working shown;
// then the detail folds into the topsheet and the total rolls up. Positions are driven by
// --t in acts.css, with each piece's timing and place a class in BUDGET_CSS; the beam
// (Magic UI) and the rolling total (Motion Primitives) are what an island turns on.
import { useEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation } from "motion/react";
import { Styler } from "../../lib/styler";
import { AnimatedBeam } from "../vendor/magicui/animated-beam";
import { SlidingNumber } from "../vendor/motion-primitives/sliding-number";

// From Method Schedule. y is where each chip sits, in stage units.
const CHIPS: [string, string, number][] = [
  ["Shoot days", "18", 14.6], ["Cast days", "64", 19.9], ["Locations", "3", 25.2], ["Company moves", "1", 30.5],
];
// Invented lines: [account, line, working, amount, which chip it comes from].
const LINES: [string, string, string, number, number][] = [
  ["1410", "Cast, 8 speaking parts", "64 days × $1,850", 118400, 1],
  ["2010", "Production manager", "18 days × $650", 11700, 0],
  ["2020", "First assistant director", "18 days × $600", 10800, 0],
  ["2210", "Camera package", "18 days × $1,450", 26100, 0],
  ["2510", "Grip and electric", "18 days × $1,250", 22500, 0],
  ["2810", "Catering, 42 people", "18 days × $1,176", 21168, 0],
  ["3010", "Locations", "3 × $12,500", 37500, 2],
  ["3050", "Company move", "1 × $6,800", 6800, 3],
];
export const TOPSHEET: [string, string, number][] = [
  ["1100", "Story and rights", 24000],
  ["1300", "Director", 65000],
  ["1400", "Cast, 8 speaking parts", 118400],
  ["2000", "Production, 18 shoot days", 486250],
  ["4000", "Post-production", 161800],
  ["6500", "Fringes, insurance and contingency", 148950],
];
export const TOTAL = TOPSHEET.reduce((n, r) => n + r[2], 0);
/** When the beam runs (steps 1 and 2) and when the total rolls (step 3), as parts of --t. */
export const BUDGET_STEPS = [0.06, 0.66, 0.84];

const X = 41, TOP = 13.5, ROW = 4.4;
const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const sx = new Styler(".act-budget", "u");
const C = {
  detail: sx.add({ "--d": 0.66, "--s": 0.14 }),
  detailHead: sx.add({ "--d": 0.04, "--s": 0.08, "--x0": X + 1.2, "--y0": TOP - 4 }),
  rows: LINES.map((l, i) => sx.add({ "--d": 0.08 + i * 0.05, "--s": 0.25, "--x0": 6, "--y0": CHIPS[l[4]][2] - 1.5, "--k0": 0.45,
                                     "--r0": i % 2 ? -6 : 5, "--x1": X, "--y1": TOP + i * ROW })),
  topHead: sx.add({ "--d": 0.7, "--s": 0.1, "--x0": X + 1.2, "--y0": TOP - 4 }),
  top: TOPSHEET.map((_, j) => sx.add({ "--d": 0.7 + j * 0.02, "--s": 0.14, "--x0": X, "--y0": TOP + j * ROW + 2, "--y1": TOP + j * ROW })),
  total: sx.add({ "--d": 0.82, "--s": 0.12, "--x0": X, "--y0": TOP + TOPSHEET.length * ROW + 0.5 }),
};
export const BUDGET_CSS = sx.css();

export default function BudgetAct({ step = BUDGET_STEPS.length, title = "Method Budget" }: { step?: number; title?: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const from = useRef<HTMLDivElement>(null);
  const to = useRef<HTMLSpanElement>(null);
  // The beam and the rolling digits only once a script runs and motion is fine; until then
  // (and without one, and for reduced motion) the total is plain text.
  const [live, setLive] = useState(false);
  useEffect(() => setLive(!matchMedia("(prefers-reduced-motion: reduce)").matches), []);

  return (
    <LazyMotion features={domAnimation} strict>
    <div className="act act-budget" aria-hidden="true" ref={stage}>
      <div className="win"><div className="win-bar"><i /><i /><i /><b>{title}</b></div></div>
      <div className="sched" ref={from}>
        <p>From Method Schedule</p>
        {CHIPS.map(([label, n]) => <div key={label} className="chip"><span>{label}</span><b>{n}</b></div>)}
      </div>
      {live && <AnimatedBeam containerRef={stage} fromRef={from} toRef={to} curvature={-40} play={step === 1 || step === 2} />}

      {/* The detail: lines fly in, then fold away into the topsheet. */}
      <div className={`k out ${C.detail}`}>
        <span className={`head k in mv ${C.detailHead}`} ref={to}>Detail</span>
        {LINES.map(([acct, line, working, amount], i) => (
          <div key={acct} className={`row fly k mv in ${C.rows[i]}`}>
            <span className="a">{acct}</span><span>{line}</span><span className="x">{working}</span><span className="m">{money(amount)}</span>
          </div>
        ))}
      </div>

      {/* The topsheet. */}
      <span className={`head k in mv ${C.topHead}`}>Topsheet</span>
      {TOPSHEET.map(([acct, what, amount], j) => (
        <div key={acct} className={`top k in mv ${C.top[j]}`}>
          <span className="a">{acct}</span><span>{what}</span><span className="m">{money(amount)}</span>
        </div>
      ))}
      <div className={`total k in mv ${C.total}`}>
        <span>Total</span>
        <span>{live ? <>$<SlidingNumber value={step >= 3 ? TOTAL : 0} /></> : money(TOTAL)}</span>
      </div>
    </div>
    </LazyMotion>
  );
}
