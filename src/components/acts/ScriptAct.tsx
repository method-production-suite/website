// Method Storyteller's act: a scene is typed on a typewriter, the page lifts out into the
// app, and every line moves to where a screenplay puts it. Pure render: --t on an
// ancestor (written by an island through src/lib/scrub.ts) drives it all in acts.css, and
// each piece's timing and place is a class in SCRIPT_CSS (src/lib/styler.ts).
import { Styler } from "../../lib/styler";

type Kind = "sh" | "a" | "c" | "d";
// One scene, invented. Line breaks are the same typed and formatted, so lines only move.
const LINES: [Kind, string][] = [
  ["sh", "EXT. RIDGE ROAD - DAY"],
  ["a", "Wind comes down off the ridge in long flat gusts,"],
  ["a", "pushing the grass one way and then, for no"],
  ["a", "reason, the other."],
  ["c", "DELACROIX"],
  ["d", "Thirty-one."],
  ["a", "They take the bend. Gravel lets go under Mara's"],
  ["a", "boot and goes quietly over the edge."],
  ["c", "MARA"],
  ["d", "You don't have to do that out loud."],
  ["sh", "EXT. RADIO HUT - DAY"],
  ["a", "A prefab hut bolted to the rock, a radio mast"],
  ["a", "guyed four ways."],
];

// Page units: the sheet is 100 wide (8.5in), so an inch is 11.8.
const MARGIN: Record<Kind, number> = { sh: 17.6, a: 17.6, c: 43.5, d: 29.4 };
const TYPED_X = 11, TYPED_TOP = 9, TYPED_GAP = 4.4; // a double-spaced typewriter draft
const SET_TOP = 9, SET_GAP = 2.9;                    // single-spaced, a blank line between blocks
const PAGE = 50;                // the sheet's width in stage units
const TYPE_AT = 42;             // where the typewriter strikes, in stage units
const FINAL = { x: 28, y: 9 };  // where the page sits in the app window

const sx = new Styler(".act-script", "s");
const total = LINES.reduce((n, [, s]) => n + s.length, 0);
let typed = 0, y = SET_TOP;
const lines = LINES.map(([kind, text], i) => {
  if (i > 0 && (kind === "sh" || kind === "c" || (kind === "a" && LINES[i - 1][0] !== "a"))) y += SET_GAP;
  const set = { x: MARGIN[kind], y };
  y += SET_GAP;
  const d = 0.03 + (0.45 * typed) / total, s = (0.45 * text.length) / total;
  typed += text.length;
  return {
    kind, text, set,
    move: sx.add({ "--d": 0.72 + i * 0.008, "--s": 0.18, "--x0": TYPED_X, "--y0": TYPED_TOP + i * TYPED_GAP, "--x1": set.x, "--y1": set.y }),
    typing: sx.add({ "--d": d, "--s": s }),
    chars: sx.add({ "--n": text.length }),
  };
});
const firstY = (TYPED_TOP * PAGE) / 100, lastY = ((TYPED_TOP + (LINES.length - 1) * TYPED_GAP) * PAGE) / 100;
const feed = { x: (100 - PAGE) / 2, y0: TYPE_AT - firstY, y1: TYPE_AT - lastY };
const scenes = lines.filter((l) => l.kind === "sh");
const C = {
  win: sx.add({ "--d": 0.55, "--s": 0.15 }),
  side: sx.add({ "--d": 0.62, "--s": 0.15 }),
  feed: sx.add({ "--d": 0.03, "--s": 0.45, "--x0": feed.x, "--y0": feed.y0, "--y1": feed.y1 }),
  lift: sx.add({ "--d": 0.52, "--s": 0.2, "--x1": FINAL.x - feed.x, "--y1": FINAL.y - feed.y1 }),
  marks: sx.add({ "--d": 0.84, "--s": 0.14 }),
  pageNo: sx.add({ "--x0": 86, "--y0": 4 }),
  numL: scenes.map((l) => sx.add({ "--x0": 8, "--y0": l.set.y })),
  numR: scenes.map((l) => sx.add({ "--x0": 89, "--y0": l.set.y })),
  // The camera starts close on the typewriter's paper and pulls back as the page lifts out.
  camera: sx.add({ "--d": 0.42, "--s": 0.3, "--k0": 1.45, "--x0": -22.5, "--y0": -10, "--x1": 0, "--y1": 0 }),
  typewriter: sx.add({ "--d": 0.5, "--s": 0.2, "--x0": 12, "--y0": 47, "--y1": 80 }),
};
export const SCRIPT_CSS = sx.css();

export default function ScriptAct({ title = "Method Storyteller" }: { title?: string }) {
  return (
    <div className="act act-script" aria-hidden="true"><div className="a-lens">
      <div className="a-desk" />
      <div className={`a-camera a-k a-mv ${C.camera}`}>
      <div className={`a-win a-k a-in ${C.win}`}>
        <div className="a-win-bar"><i /><i /><i /><b>{title}</b></div>
      </div>
      <div className={`a-side a-k a-in ${C.side}`}>
        <p>Scenes</p>
        <ul>{scenes.map((l, n) => <li key={n}>{n + 1}&nbsp;&nbsp;{l.text}</li>)}</ul>
      </div>

      {/* The page: fed up through the typewriter, then lifted into the window. */}
      <div className={`a-k a-mv ${C.feed}`}>
        <div className={`a-k a-mv ${C.lift}`}>
          <div className="a-sheet">
            {lines.map((l, i) => (
              <div key={i} className={`a-ln a-${l.kind} a-k a-mv ${l.move}`}>
                <span className={`a-k ${l.typing}`}>
                  <span className={`a-typed ${l.chars}`}>{l.text}</span><span className="a-caret" />
                </span>
              </div>
            ))}
            <span className={`a-k a-in ${C.marks}`}>
              {scenes.map((_, n) => (
                <span key={n}>
                  <span className={`a-mark a-mv ${C.numL[n]}`}>{n + 1}</span>
                  <span className={`a-mark a-mv ${C.numR[n]}`}>{n + 1}</span>
                </span>
              ))}
              <span className={`a-mark a-mv ${C.pageNo}`}>1.</span>
            </span>
          </div>
        </div>
      </div>

      <div className={`a-typewriter a-k a-mv a-out ${C.typewriter}`} />
      </div>
    </div></div>
  );
}
