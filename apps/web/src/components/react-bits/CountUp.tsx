// Adapted from David Haz / React Bits CountUp (MIT + Commons Clause).
// Motion-value spring and direct text subscription retained; starts from the
// previous actual amount, announces only the final value, skips keyboard motion.
import { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "motion/react";
export default function CountUp({
  to,
  instant = false,
}: {
  to: number;
  instant?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const value = useMotionValue(to);
  const spring = useSpring(value, { damping: 40, stiffness: 240 });
  useEffect(
    () =>
      spring.on("change", (latest) => {
        if (ref.current)
          ref.current.textContent = Math.round(latest).toString();
      }),
    [spring],
  );
  useEffect(() => {
    if (reduce || instant) {
      spring.jump(to);
      if (ref.current) ref.current.textContent = to.toString();
    }
    value.set(to);
  }, [to, reduce, instant, spring, value]);
  return (
    <>
      <span aria-hidden="true" ref={ref}>
        {to}
      </span>
      <span className="sr-only">{to}</span>
    </>
  );
}
