// The pinned story: one production moves through the apps as you scroll, and as the story
// scrolls away its timeline dots lift off and grow into the app cards below.
//
// The server renders every step and every pane, so the story reads complete without
// JavaScript (and for reduced motion, and under 761px): the steps as a list, the panes one
// after another. With JavaScript the <html> element carries class "js" from the first
// paint, and hub-motion.css pins the stage; this island then follows the scroll. It also
// slides the sticky suite bar away once the app cards are on screen.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NumberTicker } from "../vendor/magicui/number-ticker";

export interface StoryApp {
  slug: string;
  name: string;
  does: string;
  tagline: string;
  accent: [string, string];
}

const accent = (a: StoryApp) => ({ "--app-accent": a.accent[0], "--app-accent-dark": a.accent[1] }) as CSSProperties;

// Each app's step and pane. An app without an entry here gets a step from its catalog line
// and no pane, so a new app in apps.toml never breaks the story.
const STEPS: Record<string, { title: string; text: string; pane: (on: boolean) => ReactNode }> = {
  storyteller: {
    title: "Write it",
    text: "Tab and Enter move between heading, action, character and dialogue. Pages break the way a production expects.",
    pane: () => (
      <div className="script">
        <div className="sh">EXT. RIDGE ROAD - DAY <span className="num">1</span></div>
        <p>Wind comes down off the ridge in long flat gusts, pushing the grass one way and then, for no reason, the other.</p>
        <div className="ch">DELACROIX</div><div className="dl">Thirty-one.</div>
        <p>They take the bend. Gravel lets go under Mara's boot and goes quietly over the edge.</p>
        <div className="ch">MARA</div><div className="dl">You don't have to do that out loud.</div>
        <div className="sh">EXT. RADIO HUT - DAY <span className="num">2</span></div>
        <p>A prefab hut bolted to the rock, a radio mast guyed four ways.</p>
      </div>
    ),
  },
  reader: {
    title: "Read it anywhere",
    text: "The script PDF becomes an e-book that reflows on an e-reader, with the script's shape intact.",
    pane: () => (
      <div className="ereader"><div className="device"><div className="eink">
        <b>EXT. RIDGE ROAD - DAY</b>Wind comes down off the ridge in long flat gusts, pushing the grass one way and then, for no reason, the other.
        <b>DELACROIX</b>Thirty-one.<b>MARA</b>You don't have to do that out loud.
      </div></div></div>
    ),
  },
  schedule: {
    title: "Schedule it",
    text: "Breakdown, stripboard and day out of days: 80 pages become 18 shoot days.",
    pane: () => (
      <>
        <div className="board-legend">
          <span><i className="k-dx" />Day ext.</span><span><i className="k-nx" />Night ext.</span>
          <span><i className="k-di" />Day int.</span><span><i className="k-br" />Day break</span>
        </div>
        <div className="board">{BOARD}</div>
      </>
    ),
  },
  budget: {
    title: "Budget it",
    text: "The shoot days flow straight into the budget, with an explanation for every number.",
    pane: (on) => (
      <>
        <p className="kicker">Topsheet</p>
        <table className="top"><tbody>
          {TOPSHEET.map(([acct, what, amount]) => (
            <tr key={acct}><td className="acct">{acct}</td><td>{what}</td><td>${amount.toLocaleString("en-US")}</td></tr>
          ))}
          <tr className="total"><td></td><td>Total</td><td>$<NumberTicker value={TOPSHEET.reduce((n, r) => n + r[2], 0)} play={on} /></td></tr>
        </tbody></table>
      </>
    ),
  },
};

const TOPSHEET: [string, string, number][] = [
  ["1100", "Story and rights", 24000],
  ["1300", "Director", 65000],
  ["1400", "Cast, 8 speaking parts", 118400],
  ["2000", "Production, 18 shoot days", 486250],
  ["4000", "Post-production", 161800],
  ["6500", "Fringes, insurance and contingency", 148950],
];

// Eighteen shoot days of strips (day ext., night ext., day int.), each closed by a day break.
const KINDS = ["k-dx", "k-nx", "k-di"];
const BOARD = Array.from({ length: 18 }, (_, d) => (
  <div className="day" key={d}>
    {Array.from({ length: 3 + ((d * 7) % 4) }, (_, s) => (
      <div key={s} className={`strip ${KINDS[(d + s) % 3]}`} style={{ height: 14 + ((d * 3 + s * 5) % 18) }} />
    ))}
    <div className="strip k-br" />
  </div>
));

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function Story({ apps }: { apps: StoryApp[] }) {
  const root = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const story = root.current;
    if (!story) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const narrow = matchMedia("(max-width: 760px)");
    const bar = document.querySelector<HTMLElement>("[data-suite-bar].sticky");
    const steps = story.querySelector<HTMLElement>(".steps")!;
    const dots = [...story.querySelectorAll<HTMLElement>(".dot")];
    const ghosts = [...story.querySelectorAll<HTMLElement>(".ghost")];
    const fading = [...story.querySelectorAll<HTMLElement>("[data-fade]")];
    const cards = apps.map((a) => document.querySelector<HTMLElement>(`[data-morph-card="${a.slug}"]`));
    const grid = cards[0]?.parentElement ?? null;
    let frame = 0;

    const reset = () => {
      ghosts.forEach((g) => (g.style.opacity = "0"));
      dots.forEach((d) => (d.style.visibility = ""));
      fading.forEach((el) => (el.style.opacity = ""));
      steps.style.removeProperty("--rail");
      cards.forEach((c) => c && (c.style.opacity = ""));
    };

    const draw = () => {
      frame = 0;
      // The suite bar stays until the app cards take over.
      if (bar && grid) bar.classList.toggle("away", grid.getBoundingClientRect().top < innerHeight * 0.55);
      const on = !still.matches && !narrow.matches;
      setMoving(on);
      if (!on) return reset();

      // Which step is showing follows how far through the pinned section you are.
      const r = story.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, story.offsetHeight - innerHeight));
      steps.style.setProperty("--p", p.toFixed(3));
      setCurrent(Math.min(apps.length - 1, Math.floor(p * apps.length)));

      // The morph: as the story leaves, everything but the dots fades, then the dots grow
      // into the cards, which fill in at the end.
      if (!grid || cards.some((c) => !c)) return;
      const startY = story.offsetTop + story.offsetHeight - innerHeight;
      const endY = grid.getBoundingClientRect().top + scrollY - innerHeight * 0.22;
      const t = clamp((scrollY - startY) / Math.max(1, endY - startY));
      const fill = t < 0.82 ? 0 : (t - 0.82) / 0.18;
      cards.forEach((c) => (c!.style.opacity = fill.toFixed(3)));
      const fade = Math.min(1, t / 0.22);
      fading.forEach((el) => (el.style.opacity = (1 - fade).toFixed(3)));
      steps.style.setProperty("--rail", (1 - fade).toFixed(3));
      dots.forEach((d) => (d.style.visibility = t > 0 && t < 1 ? "hidden" : ""));
      if (t <= 0 || t >= 1) {
        ghosts.forEach((g) => (g.style.opacity = "0"));
        return;
      }
      const e = ease(Math.max(0, (t - 0.2) / 0.8));
      ghosts.forEach((g, k) => {
        const a = dots[k].getBoundingClientRect(), b = cards[k]!.getBoundingClientRect();
        g.style.width = `${lerp(a.width, b.width, e)}px`;
        g.style.height = `${lerp(a.height, b.height, e)}px`;
        g.style.transform = `translate(${lerp(a.left, b.left, e)}px, ${lerp(a.top, b.top, e)}px)`;
        g.style.borderRadius = `${lerp(a.width / 2, 12, e)}px`;
        g.style.opacity = (t < 0.82 ? 1 : 1 - fill).toFixed(3);
      });
    };

    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    still.addEventListener("change", schedule);
    narrow.addEventListener("change", schedule);
    draw();
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      still.removeEventListener("change", schedule);
      narrow.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
      reset();
    };
  }, [apps]);

  // Until this island runs, and whenever it isn't moving, every step is "on".
  const on = (k: number) => !moving || k <= current;
  const shown = (k: number) => !moving || k === current;

  return (
    <section className="story" id="story" aria-labelledby="story-h" ref={root} data-live={moving || undefined}>
      <div className="stage">
        <div className="wrap stage-grid">
          <div>
            <p className="kicker" data-fade>One production, {apps.length === 4 ? "four" : apps.length} apps</p>
            <h2 id="story-h" data-fade>From first draft to last shoot day.</h2>
            <div className="steps">
              <span className="bar" aria-hidden="true" data-fade />
              <ol>
                {apps.map((a, k) => {
                  const s = STEPS[a.slug];
                  return (
                    <li key={a.slug} className={`step${on(k) ? " on" : ""}`} style={accent(a)}>
                      <span className="dot" aria-hidden="true" />
                      <div data-fade>
                        <span className="app">{a.name}</span>
                        <h3>{s?.title ?? `${a.does} it`}</h3>
                        <p>{s?.text ?? a.tagline}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
          <div className="view" aria-hidden="true" data-fade>
            {apps.filter((a) => STEPS[a.slug]).map((a) => {
              const k = apps.indexOf(a);
              return (
                <div key={a.slug} className={`pane pane-${a.slug}${shown(k) ? " on" : ""}`} style={accent(a)}>
                  <span className="tag">{a.name}</span>
                  {STEPS[a.slug].pane(shown(k))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ghosts" aria-hidden="true">
        {apps.map((a) => <div key={a.slug} className="ghost" style={accent(a)} />)}
      </div>
    </section>
  );
}
