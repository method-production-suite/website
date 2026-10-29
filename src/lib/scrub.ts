// Scroll scrubbing for the acts. An act is drawn entirely in CSS from one number, --t, from
// 0 (the start of its story) to 1 (the end). The server renders --t: 1, the finished
// picture, so every act reads complete before any JavaScript runs and for reduced motion.
// Once a script runs, it only ever writes --t; src/styles/acts.css does the rest.
import { useEffect, useRef, useState, type RefObject } from "react";

export const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
/** The gentle curve for scroll-driven moves: it never stops dead at either end. */
export const soft = (t: number) => t * t * (3 - 2 * t);

/** How far a pinned section has scrolled: 0 when its top reaches the top of the window,
 *  1 when its bottom reaches the bottom. */
export function pinnedProgress(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return clamp(-r.top / Math.max(1, el.offsetHeight - innerHeight));
}

/** How far an element has come into view: 0 as its top enters the bottom of the window,
 *  1 once its middle is a little above the window's middle. */
export function viewProgress(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return clamp((innerHeight - r.top) / (innerHeight * 0.55 + r.height * 0.5));
}

export const STILL = "(prefers-reduced-motion: reduce)";
export const WIDE = "(min-width: 761px)";

/**
 * Follow the scroll and write --t on `target`. On a wide screen the act is pinned inside
 * `section` (a tall section, pinned by acts.css); on a narrow one it plays as it comes
 * into view. For reduced motion it stays finished. Returns whether it is moving, and the
 * latest t, for the few things CSS can't do (a number that counts).
 */
export function useScrub(section: RefObject<HTMLElement | null>, target: RefObject<HTMLElement | null>,
                         { pinned = true, thresholds = [] as number[] } = {}) {
  const [moving, setMoving] = useState(false);
  const [step, setStep] = useState(thresholds.length);
  const last = useRef(-1);

  useEffect(() => {
    const sec = section.current, el = target.current;
    if (!sec || !el) return;
    const still = matchMedia(STILL), wide = matchMedia(WIDE);
    let frame = 0;
    const draw = () => {
      frame = 0;
      const on = !still.matches;
      setMoving(on);
      const t = !on ? 1 : pinned && wide.matches ? pinnedProgress(sec) : viewProgress(el);
      if (Math.abs(t - last.current) < 0.0005) return;
      last.current = t;
      el.style.setProperty("--t", t.toFixed(4));
      setStep(thresholds.filter((x) => t >= x).length);
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
    };
  }, [section, target, pinned]);

  return { moving, step };
}
