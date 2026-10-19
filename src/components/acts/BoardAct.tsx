// Method Schedule's act: scene cards pinned to a corkboard in script order come down,
// sort themselves into shoot days and become a stripboard, colored day or night,
// interior or exterior, with a break at the end of each day. Pure render, driven by --t;
// each piece's timing and place is a class in BOARD_CSS (src/lib/styler.ts).
import { Styler } from "../../lib/styler";

type Look = "dx" | "nx" | "di" | "ni";
// Eighteen scenes, invented: [scene, set, look, pages, shoot day].
const SCENES: [number, string, Look, string, number][] = [
  [1, "RIDGE ROAD", "dx", "1 2/8", 1], [2, "RADIO HUT", "dx", "2/8", 2], [3, "RADIO HUT", "di", "1 4/8", 3],
  [4, "RIDGE ROAD", "nx", "6/8", 5], [5, "SUPPLY TRUCK", "di", "3/8", 4], [6, "RADIO HUT", "ni", "2", 6],
  [7, "RIDGE ROAD", "dx", "1", 1], [8, "VALLEY FLOOR", "dx", "5/8", 2], [9, "RADIO HUT", "di", "1 1/8", 3],
  [10, "SUPPLY TRUCK", "nx", "4/8", 5], [11, "RADIO HUT", "ni", "7/8", 6], [12, "VALLEY FLOOR", "dx", "1 3/8", 2],
  [13, "RIDGE ROAD", "dx", "2/8", 1], [14, "RADIO HUT", "di", "1", 3], [15, "SUPPLY TRUCK", "di", "6/8", 4],
  [16, "RIDGE ROAD", "nx", "1 2/8", 5], [17, "RADIO HUT", "ni", "3/8", 6], [18, "SUPPLY TRUCK", "di", "4/8", 4],
];
const LOOK: Record<Look, string> = { dx: "EXT. DAY", nx: "EXT. NIGHT", di: "INT. DAY", ni: "INT. NIGHT" };
const TILT = [-4, 3, -2, 5, -3, 2, 4, -5, 1, -2, 3, -4, 2, -1, 5, -3, -2, 4];
const CARD = { w: 13, h: 8.5 };
const STRIP = { w: 3.2, h: 52, gap: 0.4, top: 13 };
const BREAK = 1.4, LEFT = 12;

const sx = new Styler(".act-board", "b");
// Stripboard order: by shoot day, then scene.
const order = SCENES.map((s, i) => ({ s, i })).sort((a, b) => a.s[4] - b.s[4] || a.s[0] - b.s[0]);
let x = LEFT, dayStart = LEFT;
const at = new Map<number, { k: number; x: number }>();
const breaks: { day: number; x: number; first: number }[] = [];
order.forEach(({ s, i }, k) => {
  at.set(i, { k, x });
  x += STRIP.w + STRIP.gap;
  const next = order[k + 1];
  if (!next || next.s[4] !== s[4]) {
    breaks.push({ day: s[4], x, first: dayStart });
    x += BREAK + STRIP.gap;
    dayStart = x;
  }
});
const corkAt = (i: number) => {
  const col = i % 6, row = Math.floor(i / 6);
  return { x: 4 + col * 15.5 + (row % 2 ? 1.2 : -0.6), y: 16 + row * 14 + (col % 2 ? 1 : -0.8), row };
};
const cards = SCENES.map(([n, set, look, pages], i) => {
  const p = at.get(i)!, c = corkAt(i);
  const d = 0.22 + p.k * 0.012;
  return {
    n, set, look, pages,
    card: sx.add({ "--d": d, "--s": 0.45, "--x0": c.x, "--y0": c.y, "--r0": TILT[i], "--x1": p.x, "--y1": STRIP.top,
                   "--w0": CARD.w, "--h0": CARD.h, "--w1": STRIP.w, "--h1": STRIP.h }),
    fill: sx.add({ "--d": d + 0.08, "--s": 0.2 }),
    face: sx.add({ "--d": d, "--s": 0.14 }),
    label: sx.add({ "--x0": p.x, "--y0": STRIP.top }),
    pin: sx.add({ "--d": 0.04 + i * 0.006, "--s": 0.08, "--x0": c.x + 5.7, "--y0": c.y - 0.6, "--y1": c.y - 4 }),
  };
});
const C = {
  win: sx.add({ "--d": 0.45, "--s": 0.25 }),
  cork: sx.add({ "--d": 0.35, "--s": 0.35 }),
  labels: sx.add({ "--d": 0.82, "--s": 0.15 }),
  days: sx.add({ "--d": 0.85, "--s": 0.13 }),
  day: breaks.map((b) => sx.add({ "--x0": b.first, "--y0": 9.2 })),
  brk: breaks.map((b, j) => sx.add({ "--d": 0.76 + j * 0.02, "--s": 0.12, "--x0": b.x, "--y0": 6, "--y1": STRIP.top })),
};
export const BOARD_CSS = sx.css();

export default function BoardAct({ title = "Method Schedule" }: { title?: string }) {
  return (
    <div className="act act-board" aria-hidden="true"><div className="lens">
      <div className={`win k in ${C.win}`}>
        <div className="win-bar"><i /><i /><i /><b>{title}</b></div>
      </div>
      <div className={`cork k out ${C.cork}`} />
      <div className={`k in ${C.days}`}>
        {breaks.map((b, j) => <span key={b.day} className={`day mv ${C.day[j]}`}>Day {b.day}</span>)}
      </div>
      {cards.map((c) => (
        <div key={c.n} className={`card k mv sz ${c.card}`}>
          <div className={`fill s-${c.look} k in ${c.fill}`} />
          <div className={`face k out ${c.face}`}>
            <b>{c.n}</b>{c.set}<br /><span>{LOOK[c.look]}, {c.pages} pg</span>
          </div>
        </div>
      ))}
      <div className={`k in ${C.labels}`}>
        {cards.map((c) => <div key={c.n} className={`lbl mv ${c.label}`}><span>{c.n} {c.set}</span></div>)}
      </div>
      {breaks.map((b, j) => <div key={b.day} className={`brk k in mv ${C.brk[j]}`} />)}
      {cards.map((c) => <div key={c.n} className={`pin k out mv ${c.pin}`} />)}
    </div></div>
  );
}
