import * as Popover from "@radix-ui/react-popover";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  MagnifyingGlass,
  MapPin,
  X,
} from "@phosphor-icons/react";
import type { TripItem } from "@whereto/shared";
import {
  easeOut,
  softSpring,
  useInstantMotion,
  useMotionTrigger,
} from "./motion";

export function searchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}
export default function TripSearch({
  items,
  onSelect,
}: {
  items: TripItem[];
  onSelect: (item: TripItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const handoff = useRef(false);
  const motionTrigger = useMotionTrigger();
  const instant = useInstantMotion();
  const matches = items.filter(
    (item) =>
      !item.deletedAt &&
      searchText(
        `${item.title} ${item.location?.name ?? ""} ${item.category}`,
      ).includes(searchText(query)),
  );
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        handoff.current = false;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className="trip-search-trigger"
          aria-label="Search this trip"
        >
          <MagnifyingGlass size={21} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              forceMount
              asChild
              align="end"
              sideOffset={9}
              collisionPadding={12}
              aria-label="Search this trip"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                input.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                if (handoff.current) event.preventDefault();
              }}
            >
              <motion.div
                className="trip-search-panel playful-popover"
                initial={
                  instant
                    ? false
                    : { opacity: 0, transform: "translateY(-6px) scale(.97)" }
                }
                animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                exit={{
                  opacity: 0,
                  transform: "translateY(-4px) scale(.98)",
                  transition: { duration: instant ? 0 : 0.14, ease: easeOut },
                }}
                transition={instant ? { duration: 0 } : softSpring}
              >
                <div className="trip-search-field">
                  <MagnifyingGlass size={21} aria-hidden="true" />
                  <input
                    ref={input}
                    type="search"
                    aria-label="Find a stop in your trip"
                    placeholder="A place, a booking, a plan…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  <Popover.Close asChild>
                    <button type="button" aria-label="Close trip search">
                      <X size={19} />
                    </button>
                  </Popover.Close>
                </div>
                <div className="trip-search-heading">
                  <strong>{query ? "Matching plans" : "In your trip"}</strong>
                  <span role="status">
                    {matches.length}{" "}
                    {matches.length === 1 ? "result" : "results"}
                  </span>
                </div>
                <div className="trip-search-results">
                  {matches.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => {
                        handoff.current = true;
                        if (motionTrigger)
                          motionTrigger.current = trigger.current;
                        setOpen(false);
                        setQuery("");
                        onSelect(item);
                      }}
                    >
                      <span className="trip-search-result-icon">
                        <MapPin size={19} aria-hidden="true" />
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.state === "idea"
                            ? "Idea"
                            : item.day
                              ? new Date(
                                  `${item.day}T12:00`,
                                ).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                })
                              : "Unscheduled"}{" "}
                          · {item.location?.name || item.category}
                        </small>
                      </span>
                      <ArrowUpRight size={17} aria-hidden="true" />
                    </button>
                  ))}
                  {!matches.length && (
                    <p className="trip-search-empty">
                      No plans found. Try a place or booking name.
                    </p>
                  )}
                </div>
                <p className="trip-search-hint">
                  Searches every day of this trip, including your ideas.
                </p>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
