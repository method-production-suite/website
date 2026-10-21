// Motion Primitives' SlidingNumber (MIT, see LICENSE.md and README.md here), changed for
// this site:
//   - digits are placed in em, not measured with react-use-measure (one fewer dependency),
//     so the server renders the right number before any JavaScript runs;
//   - no layoutId (nothing here changes layout), and no Tailwind: plain class names,
//     styled in src/styles/acts.css (.sliding-number);
//   - thousands separators, for money;
//   - `m` instead of `motion`, so the page loads only the features it uses (LazyMotion).
import { useEffect } from "react";
import { MotionValue, m, useSpring, useTransform, motionValue } from "motion/react";

const TRANSITION = { stiffness: 280, damping: 18, mass: 0.3 };

function Digit({ value, place }: { value: number; place: number }) {
  const valueRoundedToPlace = Math.floor(value / place) % 10;
  const animatedValue = useSpring(motionValue(valueRoundedToPlace), TRANSITION);

  useEffect(() => {
    animatedValue.set(valueRoundedToPlace);
  }, [animatedValue, valueRoundedToPlace]);

  return (
    <span className="sn-digit">
      <span className="sn-ghost">0</span>
      {Array.from({ length: 10 }, (_, i) => (
        <Num key={i} mv={animatedValue} number={i} />
      ))}
    </span>
  );
}

function Num({ mv, number }: { mv: MotionValue<number>; number: number }) {
  const y = useTransform(mv, (latest) => {
    const placeValue = latest % 10;
    const offset = (10 + number - placeValue) % 10;
    let memo = offset;
    if (offset > 5) memo -= 10;
    return `${memo}em`;
  });
  return (
    <m.span style={{ y }} className="sn-num">
      {number}
    </m.span>
  );
}

export function SlidingNumber({ value, separator = "," }: { value: number; separator?: string }) {
  const digits = String(Math.floor(Math.abs(value))).split("");
  const places = digits.map((_, i) => Math.pow(10, digits.length - i - 1));
  return (
    <span className="sliding-number" aria-label={value.toLocaleString("en-US")}>
      {value < 0 && "-"}
      {digits.map((_, i) => (
        <span key={`pos-${places[i]}`} className="sn-group" aria-hidden="true">
          <Digit value={Math.floor(Math.abs(value))} place={places[i]} />
          {i < digits.length - 1 && (digits.length - 1 - i) % 3 === 0 && <span>{separator}</span>}
        </span>
      ))}
    </span>
  );
}
