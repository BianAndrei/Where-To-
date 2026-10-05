// Adapted from React Bits Magnet. Attribution: docs/design-sources.md.
// Local pointer events and motion values avoid application renders per frame.
import { useEffect, useRef, type ReactNode } from "react";
import { motion, useSpring } from "motion/react";
import { softSpring, useInstantMotion } from "../motion";
export default function Magnet({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const instant = useInstantMotion();
  const x = useSpring(0, softSpring);
  const y = useSpring(0, softSpring);
  const reset = () => {
    x.set(0);
    y.set(0);
  };
  useEffect(() => {
    if (instant) {
      x.jump(0);
      y.jump(0);
    }
  }, [instant, x, y]);
  return (
    <div
      ref={ref}
      className={`rb-magnet ${className}`}
      onPointerMove={(event) => {
        if (
          instant ||
          event.pointerType !== "mouse" ||
          !ref.current ||
          ref.current.contains(document.activeElement)
        )
          return;
        const rect = ref.current.getBoundingClientRect();
        x.set(
          Math.max(
            -7,
            Math.min(7, (event.clientX - rect.left - rect.width / 2) * 0.08),
          ),
        );
        y.set(
          Math.max(
            -5,
            Math.min(5, (event.clientY - rect.top - rect.height / 2) * 0.14),
          ),
        );
      }}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onFocusCapture={reset}
    >
      <motion.div style={{ x, y }}>{children}</motion.div>
    </div>
  );
}
