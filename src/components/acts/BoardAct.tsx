// Method Schedule's act: scene cards pinned to a corkboard in script order come down,
// sort themselves into shoot days and become a stripboard, colored day or night,
// interior or exterior, one row per scene, with an end-of-day bar under each day. Pure render, driven by --t;
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
// The board as Method Schedule draws it: one horizontal strip per scene, in shooting order,
// with an "End of day" bar under each day's strips.
const STRIP = { x: 13, w: 74, h: 2.3, gap: 0.3, top: 9.5 };
const BREAK = 1.8;

const sx = new Styler(".act-board", "b");
// Stripboard order: by shoot day, then scene.
const order = SCENES.map((s, i) => ({ s, i })).sort((a, b) => a.s[4] - b.s[4] || a.s[0] - b.s[0]);
let y = STRIP.top;
const at = new Map<number, { k: number; y: number }>();
const breaks: { day: number; y: number }[] = [];
order.forEach(({ s, i }, k) => {
  at.set(i, { k, y });
  y += STRIP.h + STRIP.gap;
  const next = order[k + 1];
  if (!next || next.s[4] !== s[4]) {
    breaks.push({ day: s[4], y });
    y += BREAK + STRIP.gap;
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
    card: sx.add({ "--d": d, "--s": 0.45, "--x0": c.x, "--y0": c.y, "--r0": TILT[i], "--x1": STRIP.x, "--y1": p.y,
                   "--w0": CARD.w, "--h0": CARD.h, "--w1": STRIP.w, "--h1": STRIP.h }),
    fill: sx.add({ "--d": d + 0.04, "--s": 0.18 }),
    face: sx.add({ "--d": d + 0.08, "--s": 0.18 }),
    label: sx.add({ "--x0": STRIP.x, "--y0": p.y }),
    pin: sx.add({ "--d": 0.04 + i * 0.006, "--s": 0.08, "--x0": c.x + 5.7, "--y0": c.y - 0.6, "--y1": c.y - 4 }),
  };
});
const C = {
  win: sx.add({ "--d": 0.45, "--s": 0.25 }),
  cork: sx.add({ "--d": 0.35, "--s": 0.35 }),
  labels: sx.add({ "--d": 0.82, "--s": 0.15 }),
  brk: breaks.map((b, j) => sx.add({ "--d": 0.76 + j * 0.02, "--s": 0.12, "--x0": STRIP.x, "--y0": b.y - 2.5, "--y1": b.y })),
};
export const BOARD_CSS = sx.css();

export default function BoardAct({ title = "Method Schedule" }: { title?: string }) {
  return (
    <div className="act act-board" aria-hidden="true"><div className="a-lens">
      <div className={`a-win a-k a-in ${C.win}`}>
        <div className="a-win-bar"><i /><i /><i /><b>{title}</b></div>
      </div>
      <div className={`a-cork a-k a-out ${C.cork}`} />
      {cards.map((c) => (
        <div key={c.n} className={`a-card a-k a-mv a-sz ${c.card}`}>
          <div className={`a-fill s-${c.look} a-k a-in ${c.fill}`} />
          <div className={`a-face a-k a-out ${c.face}`}>
            <b>{c.n}</b>{c.set}<br /><span>{LOOK[c.look]}, {c.pages} pg</span>
          </div>
        </div>
      ))}
      <div className={`a-k a-in ${C.labels}`}>
        {cards.map((c) => (
          <div key={c.n} className={`a-lbl a-mv ${c.label}`}>
            <b>{c.n}</b><span>{LOOK[c.look]}</span><span>{c.set}</span><span className="a-pg">{c.pages}</span>
          </div>
        ))}
      </div>
      {breaks.map((b, j) => <div key={b.day} className={`a-brk a-k a-in a-mv ${C.brk[j]}`}>End of day {b.day}</div>)}
      {cards.map((c) => <div key={c.n} className={`a-pin a-k a-out a-mv ${c.pin}`} />)}
    </div></div>
  );
}
