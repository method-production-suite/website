// Magic UI's BlurFade (MIT, see LICENSE.md and README.md here), changed for this site:
//   - the server renders the content visible; it is only hidden once this runs, motion is
//     fine and the content is still out of view, so the page is complete without
//     JavaScript and for reduced motion;
//   - no AnimatePresence (nothing here leaves), no Tailwind.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useInView, type UseInViewOptions } from "motion/react";

interface BlurFadeProps {
  children: ReactNode;
  className?: string;
  duration?: number;
  delay?: number;
  offset?: number;
  direction?: "up" | "down" | "left" | "right";
  inViewMargin?: UseInViewOptions["margin"];
  blur?: string;
}

export function BlurFade({
  children,
  className,
  duration = 0.4,
  delay = 0,
  offset = 6,
  direction = "down",
  inViewMargin = "-50px",
  blur = "6px",
}: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: inViewMargin });
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    const offscreen = !r || r.top > innerHeight || r.bottom < 0;
    setArmed(offscreen && !matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);
  const axis = direction === "left" || direction === "right" ? "x" : "y";
  const hidden = { [axis]: direction === "right" || direction === "down" ? -offset : offset, opacity: 0, filter: `blur(${blur})` };
  const visible = { [axis]: 0, opacity: 1, filter: "blur(0px)" };
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={!armed || inView ? visible : hidden}
      transition={{ delay: armed ? 0.04 + delay : 0, duration: armed ? duration : 0, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
