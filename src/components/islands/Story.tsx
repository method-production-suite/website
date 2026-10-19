// The pinned story: one production moves through the apps as you scroll. Each step plays
// its app's act (src/components/acts/) in the pane beside it, scrubbed by the scroll: the
// page typed and set, the e-reader, the corkboard becoming a stripboard, the schedule
// becoming a budget. As the story scrolls away, its timeline dots lift off and grow into
// the app cards below.
//
// The server renders every step and every pane finished, so the story reads complete
// without JavaScript (and for reduced motion): the steps as a list, the panes one after
// another. With JavaScript the <html> element carries class "js" from the first paint and
// hub-motion.css pins the stage on wide screens; under 761px each pane plays as it comes
// into view instead.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import ScriptAct from "../acts/ScriptAct";
import BoardAct from "../acts/BoardAct";
import BudgetAct, { BUDGET_STEPS } from "../acts/BudgetAct";
import { STILL, WIDE, clamp, pinnedProgress, soft, viewProgress } from "../../lib/scrub";

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
const STEPS: Record<string, { title: string; text: string; pane: (budgetStep: number) => ReactNode }> = {
  storyteller: {
    title: "Write it",
    text: "Tab and Enter move between heading, action, character and dialogue. Pages break the way a production expects.",
    pane: () => <ScriptAct />,
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
    text: "Breakdown, stripboard and day out of days: every scene card becomes a strip in its shoot day.",
    pane: () => <BoardAct />,
  },
  budget: {
    title: "Budget it",
    text: "The shoot days flow straight into the budget, with an explanation for every number.",
    pane: (step) => <BudgetAct step={step} />,
  },
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Story({ apps }: { apps: StoryApp[] }) {
  const root = useRef<HTMLElement>(null);
  const [current, setCurrent] = useState(0);
  const [moving, setMoving] = useState(false);
  const [budgetStep, setBudgetStep] = useState(BUDGET_STEPS.length);

  useEffect(() => {
    const story = root.current;
    if (!story) return;
    const still = matchMedia(STILL), wide = matchMedia(WIDE);
    const steps = story.querySelector<HTMLElement>(".steps")!;
    const dots = [...story.querySelectorAll<HTMLElement>(".dot")];
    const ghosts = [...story.querySelectorAll<HTMLElement>(".ghost")];
    const fading = [...story.querySelectorAll<HTMLElement>("[data-fade]")];
    const panes = apps.map((a) => story.querySelector<HTMLElement>(`.pane-${a.slug}`));
    const budgetAt = apps.findIndex((a) => a.slug === "budget");
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
    // Each pane's act: its own --t, and the budget's beam and total.
    const play = (k: number, t: number) => {
      const p = panes[k];
      if (!p) return;
      p.style.setProperty("--t", t.toFixed(4));
      if (k === budgetAt) setBudgetStep(BUDGET_STEPS.filter((x) => t >= x).length);
    };

    const draw = () => {
      frame = 0;
      if (still.matches) {
        setMoving(false);
        panes.forEach((_, k) => play(k, 1));
        return reset();
      }
      if (!wide.matches) {
        // Narrow: no pinning; each pane plays as it comes into view.
        setMoving(false);
        panes.forEach((p, k) => p && play(k, viewProgress(p)));
        return reset();
      }
      setMoving(true);

      // Which step is showing follows how far through the pinned section you are, and
      // each step's act plays through its share of the scroll (finished a little early,
      // so it rests before the next one).
      const n = apps.length;
      const p = pinnedProgress(story);
      steps.style.setProperty("--p", p.toFixed(3));
      setCurrent(Math.min(n - 1, Math.floor(p * n)));
      panes.forEach((_, k) => play(k, clamp((p * n - k) / 0.8)));

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
      const e = soft(Math.max(0, (t - 0.2) / 0.8));
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
    wide.addEventListener("change", schedule);
    draw();
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      still.removeEventListener("change", schedule);
      wide.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
      reset();
    };
  }, [apps]);

  // Until this island runs, and whenever it isn't pinned, every step is "on".
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
                <div key={a.slug} className={`pane pane-${a.slug}${shown(k) ? " on" : ""}${a.slug === "reader" ? "" : " has-act"}`} style={accent(a)}>
                  <span className="tag">{a.name}</span>
                  {STEPS[a.slug].pane(budgetStep)}
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
