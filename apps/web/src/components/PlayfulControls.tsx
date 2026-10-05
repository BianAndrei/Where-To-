import {
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  type HTMLMotionProps,
} from "motion/react";
import { flushSync } from "react-dom";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { softSpring, spring, useInstantMotion } from "./motion";

/** A native form control: Space, labels, disabled fieldsets and form data work. */
export function LiquidToggle({
  children,
  className = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  children: ReactNode;
}) {
  return (
    <label className={`liquid-toggle ${className}`}>
      <span className="liquid-toggle-control">
        <input {...props} type="checkbox" role="switch" />
        <span className="liquid-toggle-track" aria-hidden="true">
          <span className="liquid-toggle-thumb">
            <span />
          </span>
        </span>
      </span>
      <span className="liquid-toggle-label">{children}</span>
    </label>
  );
}

type Person = { id: string; name: string };
export function TravellerEditRow(props: HTMLMotionProps<"div">) {
  const present = useIsPresent();
  return (
    <motion.div
      {...props}
      inert={!present}
      aria-hidden={!present || undefined}
    />
  );
}
function avatarColor(id: string) {
  return (
    Array.from(id).reduce((n, char) => (n * 33 + char.charCodeAt(0)) >>> 0, 0) %
    5
  );
}
export function TravellerAvatar({ person }: { person: Person }) {
  const initials =
    person.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "?";
  return (
    <span
      className={`traveller-avatar avatar-color-${avatarColor(person.id)}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
export function AvatarStack({
  people,
  total = people.length,
}: {
  people: Person[];
  total?: number;
}) {
  const instant = useInstantMotion();
  return (
    <span className="avatar-stack" aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        {people.slice(0, 4).map((person) => (
          <motion.span
            key={person.id}
            layout={instant ? false : "position"}
            initial={
              instant
                ? false
                : { opacity: 0, transform: "translateY(6px) scale(.92)" }
            }
            animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
            exit={{
              opacity: 0,
              transform: instant ? "none" : "translateY(-4px) scale(.92)",
            }}
            transition={instant ? { duration: 0 } : spring}
          >
            <TravellerAvatar person={person} />
          </motion.span>
        ))}
      </AnimatePresence>
      {total > 4 && (
        <span className="traveller-avatar avatar-overflow">+{total - 4}</span>
      )}
    </span>
  );
}

/** A fixed layout slot lets the search surface unfold without shifting its neighbours. */
export function SeekSearch({
  value,
  onChange,
  label,
  placeholder = label,
  onExpandedChange,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  onExpandedChange?: (open: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const instant = useInstantMotion();
  const open = expanded || !!value;
  function changeOpen(next: boolean) {
    setExpanded(next);
    onExpandedChange?.(next);
  }
  function close() {
    onChange("");
    changeOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <div
      className="seek-search"
      data-open={open}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null) &&
          !value
        )
          changeOpen(false);
      }}
    >
      <span className="seek-search-surface" aria-hidden="true" />
      <input
        ref={input}
        id={id}
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        tabIndex={open ? 0 : -1}
        disabled={!open}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      />
      <button
        ref={trigger}
        type="button"
        aria-label={open ? `Close ${label.toLowerCase()}` : label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) close();
          else {
            // Reveal within the tap gesture so mobile keyboards can open immediately.
            flushSync(() => changeOpen(true));
            input.current?.focus({ preventScroll: true });
          }
        }}
      >
        <motion.span
          animate={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
          transition={instant ? { duration: 0 } : softSpring}
        >
          {open ? (
            <X size={20} aria-hidden="true" />
          ) : (
            <MagnifyingGlass size={21} aria-hidden="true" />
          )}
        </motion.span>
      </button>
    </div>
  );
}
