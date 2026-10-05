// Adapted from David Haz / React Bits TiltedCard (MIT + Commons Clause).
// Retains normalized pointer rotation and spring physics. Children support our
// original artwork; no tooltip, mobile warning or inaccessible hover-only content.
import { useEffect, useRef, type ReactNode } from "react";
import { motion, useSpring } from "motion/react";
import { useInstantMotion } from "../motion";
export default function TiltedCard({
  children,
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useInstantMotion();
  const inactive = reduce || disabled;
  const rotateX = useSpring(0, { damping: 24, stiffness: 220, mass: 0.8 });
  const rotateY = useSpring(0, { damping: 24, stiffness: 220, mass: 0.8 });
  useEffect(() => {
    if (inactive) {
      rotateX.jump(0);
      rotateY.jump(0);
    }
  }, [inactive, rotateX, rotateY]);
  return (
    <div
      ref={ref}
      className={`rb-tilted-card ${className}`}
      onPointerMove={(event) => {
        if (
          inactive ||
          event.pointerType !== "mouse" ||
          !ref.current ||
          innerWidth < 1024
        )
          return;
        const rect = ref.current.getBoundingClientRect();
        rotateX.set(
          ((event.clientY - rect.top - rect.height / 2) / (rect.height / 2)) *
            -5,
        );
        rotateY.set(
          ((event.clientX - rect.left - rect.width / 2) / (rect.width / 2)) * 5,
        );
      }}
      onPointerLeave={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
      onPointerCancel={() => {
        rotateX.set(0);
        rotateY.set(0);
      }}
    >
      <motion.div
        style={{
          rotateX: inactive ? 0 : rotateX,
          rotateY: inactive ? 0 : rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
