// React/TypeScript adaptation of code (8).zip AnimatedHeader.jsx.
// Keeps GSAP SplitText and the per-line character x/skew stagger. Shortened travel,
// one-shot intersection trigger, complete cleanup and a reduced-motion fallback.
import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
export default function AnimatedHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !ref.current) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    let observer: IntersectionObserver | undefined;
    void Promise.all([
      import("gsap"),
      import("gsap/SplitText"),
      document.fonts.ready,
    ]).then(([{ gsap }, { SplitText }]) => {
      if (disposed || !ref.current) return;
      gsap.registerPlugin(SplitText);
      const element = ref.current.firstElementChild;
      if (!element) return;
      const readable = element.cloneNode(true) as HTMLElement;
      readable.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
      const accessibleName = (readable.textContent || "")
        .replace(/\s+/g, " ")
        .replace(/([.?])(?=[A-Z“])/g, "$1 ")
        .trim();
      const ctx = gsap.context(() => {
        const split = SplitText.create(element, {
          type: "lines,words,chars",
          charsClass: "reveal-char",
          wordsClass: "reveal-piece",
          aria: "auto",
        });
        element.setAttribute("aria-label", accessibleName);
        const timeline = gsap.timeline({ paused: true });
        const { chars, lines } = split;
        lines.forEach((line) => {
          chars
            .filter((char) => line.contains(char))
            .forEach((char, index) => {
              timeline.from(
                char,
                {
                  x: 28,
                  opacity: 0,
                  skewX: 12,
                  duration: 0.65,
                  ease: "power3.out",
                },
                index * 0.022,
              );
            });
        });
        observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              timeline.play();
              observer?.disconnect();
            }
          },
          { threshold: 0.2 },
        );
        observer.observe(element);
        // Keep the real text reflowable when the viewport changes; the entrance
        // is a one-time effect, so a resize restores static semantic markup.
        const initialWidth = element.getBoundingClientRect().width;
        const resize = new ResizeObserver(() => {
          if (
            Math.abs(element.getBoundingClientRect().width - initialWidth) < 1
          )
            return;
          observer?.disconnect();
          timeline.kill();
          split.revert();
          resize.disconnect();
        });
        resize.observe(element);
        cleanup = () => {
          resize.disconnect();
          observer?.disconnect();
          timeline.kill();
          split.revert();
        };
      }, ref);
      const restore = cleanup;
      cleanup = () => {
        restore?.();
        ctx.revert();
      };
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      cleanup?.();
    };
  }, [reduce]);
  return (
    <div className={`archive-header ${className}`} ref={ref}>
      {children}
    </div>
  );
}
