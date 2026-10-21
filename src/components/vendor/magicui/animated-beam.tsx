// Magic UI's AnimatedBeam (MIT, see LICENSE.md and README.md here), changed for this site:
//   - `play` starts and stops the light running along the beam (the act turns it on while
//     its data is moving, and it never runs for reduced motion);
//   - colors default to the page's tokens (set as styles, so CSS variables work); no
//     Tailwind or `cn`.
//   - `m` instead of `motion`, so the page loads only the features it uses (LazyMotion).
// The beam is decoration: it draws only once the page's script runs.
import { useEffect, useId, useState, type RefObject } from "react";
import { m } from "motion/react";

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  play?: boolean;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

export const AnimatedBeam = ({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 2.5,
  delay = 0,
  pathColor = "var(--rule-strong)",
  pathWidth = 2,
  pathOpacity = 0.35,
  gradientStartColor = "var(--c, var(--accent))",
  gradientStopColor = "var(--c, var(--accent))",
  play = true,
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) => {
  const id = useId();
  const [pathD, setPathD] = useState("");
  const [svgDimensions, setSvgDimensions] = useState({ width: 0, height: 0 });

  const gradientCoordinates = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"], y1: ["0%", "0%"], y2: ["0%", "0%"] }
    : { x1: ["10%", "110%"], x2: ["0%", "100%"], y1: ["0%", "0%"], y2: ["0%", "0%"] };

  useEffect(() => {
    const updatePath = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) return;
      const c = containerRef.current.getBoundingClientRect();
      const a = fromRef.current.getBoundingClientRect();
      const b = toRef.current.getBoundingClientRect();
      setSvgDimensions({ width: c.width, height: c.height });
      const startX = a.left - c.left + a.width / 2 + startXOffset;
      const startY = a.top - c.top + a.height / 2 + startYOffset;
      const endX = b.left - c.left + b.width / 2 + endXOffset;
      const endY = b.top - c.top + b.height / 2 + endYOffset;
      setPathD(`M ${startX},${startY} Q ${(startX + endX) / 2},${startY - curvature} ${endX},${endY}`);
    };
    const resizeObserver = new ResizeObserver(updatePath);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    updatePath();
    return () => resizeObserver.disconnect();
  }, [containerRef, fromRef, toRef, curvature, startXOffset, startYOffset, endXOffset, endYOffset]);

  return (
    <svg
      fill="none"
      width={svgDimensions.width}
      height={svgDimensions.height}
      xmlns="http://www.w3.org/2000/svg"
      className={`animated-beam${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${svgDimensions.width} ${svgDimensions.height}`}
      aria-hidden="true"
    >
      <path d={pathD} style={{ stroke: pathColor }} strokeWidth={pathWidth} strokeOpacity={pathOpacity} strokeLinecap="round" />
      {play && <path d={pathD} strokeWidth={pathWidth} stroke={`url(#${id})`} strokeOpacity="1" strokeLinecap="round" />}
      <defs>
        <m.linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
          animate={play ? gradientCoordinates : { x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
          transition={{ delay, duration, ease: [0.16, 1, 0.3, 1], repeat: play ? Infinity : 0 }}
        >
          <stop style={{ stopColor: gradientStartColor }} stopOpacity="0" />
          <stop style={{ stopColor: gradientStartColor }} />
          <stop offset="32.5%" style={{ stopColor: gradientStopColor }} />
          <stop offset="100%" style={{ stopColor: gradientStopColor }} stopOpacity="0" />
        </m.linearGradient>
      </defs>
    </svg>
  );
};
