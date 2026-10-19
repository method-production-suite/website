// The hero's stack: one page per app, in the suite mark's colors, that fans out as you
// scroll away. Browsers with scroll-driven CSS animations do it all in CSS (hub-motion.css);
// this island only drives the same transforms by hand in browsers without them. Nothing
// moves for people who ask for reduced motion, and the server's static stack is complete.
import { useEffect, useRef, type CSSProperties } from "react";

export interface StackApp {
  slug: string;
  does: string;
  accent: [string, string];
}

// Where each page rests in the stack and where it lands, fanned out: x and y in percent of
// the page, r in degrees. The first app is on top.
const REST = [
  { x: -6, y: -4, r: -3 },
  { x: 4, y: -2, r: 2 },
  { x: -2, y: 3, r: -1 },
  { x: 5, y: 5, r: 3 },
];
const FAN = [
  { x: -38, y: -18, r: -9 },
  { x: 34, y: -22, r: 7 },
  { x: -30, y: 24, r: 5 },
  { x: 36, y: 20, r: -6 },
];

const pose = (p: { x: number; y: number; r: number }) => `translate(${p.x}%, ${p.y}%) rotate(${p.r}deg)`;

export default function HeroStack({ apps }: { apps: StackApp[] }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || CSS.supports("animation-timeline: scroll()")) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    const sheets = [...el.querySelectorAll<HTMLElement>(".sheet")];
    let frame = 0;
    const draw = () => {
      frame = 0;
      const t = still.matches ? 0 : Math.min(1, Math.max(0, scrollY / (innerHeight * 0.6)));
      sheets.forEach((s, i) => {
        const a = REST[i % 4], b = FAN[i % 4];
        s.style.transform = pose({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, r: a.r + (b.r - a.r) * t });
      });
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(draw); };
    addEventListener("scroll", onScroll, { passive: true });
    still.addEventListener("change", draw);
    draw();
    return () => {
      removeEventListener("scroll", onScroll);
      still.removeEventListener("change", draw);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="stack" aria-hidden="true" ref={root}>
      {apps.map((a, i) => ({ a, i })).reverse().map(({ a, i }) => (
        <div
          key={a.slug}
          className="sheet"
          style={{
            "--app-accent": a.accent[0], "--app-accent-dark": a.accent[1],
            "--rest": pose(REST[i % 4]), "--fan": pose(FAN[i % 4]),
          } as CSSProperties}
        >
          <span>{a.does}</span>
        </div>
      ))}
    </div>
  );
}
