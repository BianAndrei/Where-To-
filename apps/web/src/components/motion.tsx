import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { usePreferences } from "../lib/preferences";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useIsPresent,
  useReducedMotion,
  type HTMLMotionProps,
} from "motion/react";

// Springs are for surfaces that follow the pointer. Content uses a bounded
// settle so long text never wobbles while someone is trying to read it.
export const easeOut = [0.23, 1, 0.32, 1] as const;
export const easeFlow = [0.32, 0.72, 0, 1] as const;
export const contentTransition = { duration: 0.2, ease: easeOut } as const;
export const spring = {
  type: "spring",
  duration: 0.5,
  bounce: 0.15,
} as const;
export const softSpring = {
  type: "spring",
  duration: 0.45,
  bounce: 0,
} as const;
const InputMotion = createContext(false);
const MotionTrigger = createContext<{ current: HTMLElement | null } | null>(
  null,
);
export function useMotionTrigger() {
  return useContext(MotionTrigger);
}

export function InteractionMotion({ children }: { children: ReactNode }) {
  const [keyboard, setKeyboard] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      trigger.current =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(
              'button, a, summary, [role="button"]',
            )
          : null;
      document.documentElement.dataset.input = "pointer";
      setKeyboard(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      document.documentElement.dataset.input = "keyboard";
      trigger.current = null;
      setKeyboard(true);
    };
    window.addEventListener("pointerdown", pointer, {
      passive: true,
      capture: true,
    });
    window.addEventListener("keydown", key, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", pointer, true);
      window.removeEventListener("keydown", key, true);
      delete document.documentElement.dataset.input;
    };
  }, []);
  return (
    <MotionTrigger.Provider value={trigger}>
      <InputMotion.Provider value={keyboard}>{children}</InputMotion.Provider>
    </MotionTrigger.Provider>
  );
}

export function useInstantMotion() {
  const keyboard = useContext(InputMotion);
  const reduced = useReducedMotion();
  const preferences = usePreferences();
  return keyboard || !!reduced || preferences.reducedMotion;
}

// Use a browser snapshot for a visibility switch whose live children (a map,
// for example) must stay mounted. Unsupported browsers commit immediately.
export function useSurfaceTransition() {
  const instant = useInstantMotion();
  const active = useRef<ViewTransition | null>(null);
  useEffect(() => {
    if (instant) active.current?.skipTransition();
    return () => active.current?.skipTransition();
  }, [instant]);
  return (change: () => void) => {
    active.current?.skipTransition();
    if (instant || !document.startViewTransition) {
      change();
      return;
    }
    const transition = document.startViewTransition(() => flushSync(change));
    active.current = transition;
    void transition.ready.catch(() => {});
    void transition.finished
      .catch(() => {})
      .finally(() => {
        if (active.current === transition) active.current = null;
      });
  };
}

export function MotionGroup({ children }: { children: ReactNode }) {
  const id = useId();
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

export function MotionSelection({ instant = false }: { instant?: boolean }) {
  const noMotion = useInstantMotion() || instant;
  return (
    <motion.span
      className="motion-selection"
      aria-hidden="true"
      layoutId="selection"
      transition={noMotion ? { duration: 0 } : spring}
      style={{ borderRadius: "inherit" }}
    />
  );
}

export function MotionChoice({
  active,
  children,
  className = "",
  instant = false,
  ...props
}: Omit<HTMLMotionProps<"button">, "children"> & {
  children?: ReactNode;
  active: boolean;
  instant?: boolean;
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={props.role === "tab" ? undefined : active}
      {...props}
      className={`motion-choice ${active ? "active" : ""} ${className}`}
      initial={false}
    >
      {active && <MotionSelection instant={instant} />}
      {children}
    </motion.button>
  );
}

type PanelTransition = {
  direction: number;
  instant: boolean;
  distance: number;
  duration: number;
  axis: "x" | "y";
};
const panelVariants = {
  enter: ({ direction, instant, distance, axis }: PanelTransition) => ({
    opacity: instant ? 1 : 0,
    transform: `translate${axis.toUpperCase()}(${instant ? 0 : direction * distance}px)`,
  }),
  live: { opacity: 1, transform: "none" },
  leave: ({
    direction,
    instant,
    distance,
    duration,
    axis,
  }: PanelTransition) => ({
    opacity: 0,
    transform: `translate${axis.toUpperCase()}(${instant ? 0 : -direction * distance * 0.5}px)`,
    transition: {
      duration: instant ? 0 : Math.min(0.06, duration),
      ease: easeOut,
    },
  }),
};

const PanelContent = forwardRef<
  HTMLDivElement,
  {
    children: ReactNode;
    travel: PanelTransition;
    onMeasure?: (height: number) => void;
  }
>(function PanelContent({ children, travel, onMeasure }, forwardedRef) {
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement | null>(null);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !present || !onMeasure) return;
    const measure = () => onMeasure(node.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [present, onMeasure]);
  return (
    <motion.div
      ref={attach}
      className="motion-panel-content"
      data-present={present}
      inert={!present}
      aria-hidden={!present || undefined}
      custom={travel}
      variants={panelVariants}
      initial="enter"
      animate="live"
      exit="leave"
      transition={travel.instant ? { duration: 0 } : contentTransition}
    >
      {children}
    </motion.div>
  );
});

// Key only the changing content, never its owning form state or surrounding
// navigation. Departing content is inert immediately. A brief exit clears the
// old text before its replacement arrives; rapid input selects the latest key.
export function MotionPanel({
  changeKey,
  children,
  distance = 12,
  duration = contentTransition.duration,
  order,
  axis = "x",
  resize = false,
  instant: forceInstant = false,
  className = "",
  ...props
}: Omit<HTMLMotionProps<"div">, "children"> & {
  children?: ReactNode;
  changeKey: string | number;
  distance?: number;
  duration?: number;
  order?: number;
  axis?: "x" | "y";
  resize?: boolean;
  instant?: boolean;
}) {
  const instant = useInstantMotion() || forceInstant;
  const [previous, setPrevious] = useState({
    key: changeKey,
    order,
    direction: 1,
  });
  if (previous.key !== changeKey) {
    setPrevious({
      key: changeKey,
      order,
      direction:
        order !== undefined &&
        previous.order !== undefined &&
        order < previous.order
          ? -1
          : 1,
    });
  }
  const [height, setHeight] = useState<number>();
  const measure = useCallback((next: number) => setHeight(next), []);
  const travel = {
    direction: previous.direction,
    instant,
    distance,
    duration,
    axis,
  };
  return (
    <motion.div {...props} className={`motion-panel ${className}`}>
      <motion.div
        className="motion-panel-viewport"
        data-resize={resize}
        initial={false}
        animate={resize ? { height: height ?? "auto" } : undefined}
        transition={instant ? { duration: 0 } : { duration, ease: easeFlow }}
      >
        <AnimatePresence initial={false} mode="wait" custom={travel}>
          <PanelContent
            key={changeKey}
            travel={travel}
            onMeasure={resize ? measure : undefined}
          >
            {children}
          </PanelContent>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

export function RollingValue({ children }: { children: string | number }) {
  const instant = useInstantMotion();
  const value = String(children);
  const parts = value.match(/^(.*?)(-?[\d.,]+)(.*)$/);
  const digits = parts?.[2] ?? value;
  const number = Number(value.replace(/[^\d.-]/g, ""));
  const [previous, setPrevious] = useState({ number, direction: 1 });
  if (previous.number !== number && Number.isFinite(number))
    setPrevious({ number, direction: number < previous.number ? -1 : 1 });
  return (
    <span className="rolling-value">
      <span className="sr-only">{children}</span>
      <span className="rolling-visual" aria-hidden="true">
        {parts?.[1]}
        {Array.from(digits).map((character, index) => (
          <span
            className="rolling-digit"
            data-numeric={/\d/.test(character)}
            key={digits.length - index}
          >
            <AnimatePresence
              initial={false}
              mode="popLayout"
              custom={previous.direction}
            >
              <motion.span
                key={character}
                custom={previous.direction}
                initial={
                  instant
                    ? false
                    : {
                        transform: `translateY(${previous.direction * 65}%)`,
                        opacity: 0,
                      }
                }
                animate={{ transform: "translateY(0%)", opacity: 1 }}
                variants={{
                  leave: (direction: number) => ({
                    transform: `translateY(${instant ? 0 : direction * -65}%)`,
                    opacity: 0,
                  }),
                }}
                exit="leave"
                transition={
                  instant ? { duration: 0 } : { duration: 0.25, ease: easeOut }
                }
              >
                {character}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
        {parts?.[3]}
      </span>
    </span>
  );
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const instant = useInstantMotion();
  return (
    <motion.div
      className={className}
      initial={instant ? false : { opacity: 0, transform: "translateY(16px)" }}
      whileInView={{ opacity: 1, transform: "translateY(0px)" }}
      viewport={{ once: true, amount: 0.12 }}
      transition={
        instant ? { duration: 0 } : { duration: 0.5, ease: easeOut, delay }
      }
    >
      {children}
    </motion.div>
  );
}

// Native semantics remain intact. WAAPI retargets from the current height,
// including when a disclosure is reversed before its previous motion settles.
export function Disclosure({ children, ...props }: ComponentProps<"details">) {
  const ref = useRef<HTMLDetailsElement>(null);
  const instant = useInstantMotion();
  useEffect(() => {
    const node = ref.current;
    const summary = node?.querySelector("summary");
    if (!node || !summary || instant) return;
    let animation: Animation | undefined;
    let fades: Animation[] = [];
    let targetOpen = node.open;
    const reset = () => {
      node.style.removeProperty("height");
      node.style.removeProperty("overflow");
    };
    const click = (event: MouseEvent) => {
      if (event.detail === 0 || event.defaultPrevented) return;
      event.preventDefault();
      const start = node.getBoundingClientRect().height;
      const body = Array.from(node.children).filter(
        (child) => child !== summary,
      ) as HTMLElement[];
      const opacities = body.map((child) =>
        node.open ? getComputedStyle(child).opacity : "0",
      );
      animation?.cancel();
      fades.forEach((fade) => fade.cancel());
      targetOpen = !targetOpen;
      node.open = true;
      reset();
      const end = targetOpen
        ? node.getBoundingClientRect().height
        : summary.getBoundingClientRect().height +
          parseFloat(getComputedStyle(node).paddingTop) +
          parseFloat(getComputedStyle(node).paddingBottom) +
          parseFloat(getComputedStyle(node).borderTopWidth) +
          parseFloat(getComputedStyle(node).borderBottomWidth);
      node.style.overflow = "clip";
      fades = body.map((child, index) =>
        child.animate(
          { opacity: [opacities[index] ?? "1", targetOpen ? "1" : "0"] },
          {
            duration: targetOpen ? 240 : 150,
            easing: "cubic-bezier(.23,1,.32,1)",
            fill: "both",
          },
        ),
      );
      animation = node.animate(
        { height: [`${start}px`, `${end}px`] },
        {
          duration: targetOpen ? 260 : 200,
          easing: "cubic-bezier(.32,.72,0,1)",
          fill: "both",
        },
      );
      animation.onfinish = () => {
        node.open = targetOpen;
        animation?.cancel();
        animation = undefined;
        fades.forEach((fade) => fade.cancel());
        fades = [];
        reset();
      };
    };
    summary.addEventListener("click", click);
    return () => {
      summary.removeEventListener("click", click);
      if (animation) {
        animation.cancel();
        node.open = targetOpen;
      }
      fades.forEach((fade) => fade.cancel());
      reset();
    };
  }, [instant, props.open]);
  return (
    <details {...props} ref={ref}>
      {children}
    </details>
  );
}

export function LoadingJourney({
  children = "Packing the essentials…",
}: {
  children?: ReactNode;
}) {
  return (
    <div className="page-loading" role="status">
      <span className="journey-loader" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{children}</span>
    </div>
  );
}
