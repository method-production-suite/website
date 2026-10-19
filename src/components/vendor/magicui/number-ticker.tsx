// Magic UI's NumberTicker (MIT, see LICENSE.md and README.md here), changed for this site:
//   - the server renders the final value, so the number is right before any JavaScript
//     runs and for people who ask for reduced motion (it only counts when motion is fine);
//   - `play` holds the count until its pane is showing, not just in the viewport;
//   - no Tailwind or `cn`: the class name passes straight through.
import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useInView, useMotionValue, useSpring } from "motion/react";

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number;
  startValue?: number;
  direction?: "up" | "down";
  delay?: number;
  decimalPlaces?: number;
  play?: boolean;
}

const format = (n: number, decimalPlaces: number) =>
  Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(n.toFixed(decimalPlaces)));

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  play = true,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = direction === "down" ? value : startValue;
  const to = direction === "down" ? startValue : value;
  const motionValue = useMotionValue(from);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "0px" });
  const moving = useRef(false);

  // Only count when motion is fine; otherwise the server's final value stays.
  useEffect(() => {
    moving.current = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (moving.current && ref.current) ref.current.textContent = format(from, decimalPlaces);
  }, [from, decimalPlaces]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isInView && play && moving.current) {
      timer = setTimeout(() => motionValue.set(to), delay * 1000);
    }
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [motionValue, isInView, play, delay, to]);

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current && moving.current) ref.current.textContent = format(latest, decimalPlaces);
      }),
    [springValue, decimalPlaces],
  );

  return (
    <span ref={ref} className={className} {...props}>
      {format(to, decimalPlaces)}
    </span>
  );
}
