import * as Popover from "@radix-ui/react-popover";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Plus,
  X,
  MapPin,
  ForkKnife,
  Bed,
  Train,
  Wallet,
} from "@phosphor-icons/react";
import type { TripItem } from "@whereto/shared";
import { easeOut, spring, useInstantMotion, useMotionTrigger } from "./motion";

const choices = [
  {
    kind: "activity",
    label: "Activity",
    Icon: MapPin,
    x: -110,
    y: -12,
    color: "peach",
  },
  {
    kind: "restaurant",
    label: "Food",
    Icon: ForkKnife,
    x: -74,
    y: -84,
    color: "rose",
  },
  {
    kind: "accommodation",
    label: "Stay",
    Icon: Bed,
    x: 0,
    y: -112,
    color: "sage",
  },
  {
    kind: "transport",
    label: "Transport",
    Icon: Train,
    x: 74,
    y: -84,
    color: "blue",
  },
  {
    kind: "other",
    label: "Expense",
    Icon: Wallet,
    x: 110,
    y: -12,
    color: "sand",
  },
] as const;

export default function RadialAdd({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (kind: TripItem["kind"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const instant = useInstantMotion();
  const trigger = useRef<HTMLButtonElement>(null);
  const motionTrigger = useMotionTrigger();
  const handoff = useRef(false);
  return (
    <div className="radial-add">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          handoff.current = false;
          setOpen(next);
        }}
      >
        <Popover.Trigger asChild>
          <button ref={trigger} type="button" className="radial-add-trigger">
            <motion.span
              className="radial-add-core"
              animate={{ transform: `rotate(${open ? 45 : 0}deg)` }}
              transition={instant ? { duration: 0 } : spring}
            >
              <Plus size={23} aria-hidden="true" />
            </motion.span>
            <span>{label}</span>
          </button>
        </Popover.Trigger>
        <AnimatePresence>
          {open && (
            <Popover.Portal forceMount>
              <Popover.Content
                forceMount
                asChild
                side="top"
                sideOffset={10}
                collisionPadding={12}
                aria-label="Choose what to add"
                onCloseAutoFocus={(event) => {
                  if (handoff.current) event.preventDefault();
                }}
              >
                <motion.div
                  className="radial-add-panel"
                  inert={!open}
                  initial={instant ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: instant ? 0 : 0.16, ease: easeOut }}
                  onKeyDown={(event) => {
                    if (
                      ![
                        "ArrowRight",
                        "ArrowLeft",
                        "ArrowDown",
                        "ArrowUp",
                        "Home",
                        "End",
                      ].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const buttons = [
                      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        ".radial-action",
                      ),
                    ];
                    const index = buttons.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? buttons.length - 1
                          : (index +
                              (["ArrowRight", "ArrowDown"].includes(event.key)
                                ? 1
                                : -1) +
                              buttons.length) %
                            buttons.length;
                    buttons[next]?.focus();
                  }}
                >
                  <span className="radial-add-caption">
                    What’s next on the itinerary?
                  </span>
                  <div className="radial-add-fan">
                    {choices.map(
                      ({ kind, label, Icon, x, y, color }, index) => (
                        <motion.button
                          key={kind}
                          type="button"
                          className={`radial-action radial-${color}`}
                          aria-label={`Add ${label.toLowerCase()}`}
                          initial={
                            instant
                              ? false
                              : {
                                  opacity: 0,
                                  transform: "translate(0px, 18px) scale(.92)",
                                }
                          }
                          animate={{
                            opacity: 1,
                            transform: `translate(${x}px, ${y}px) scale(1)`,
                          }}
                          exit={{
                            opacity: 0,
                            transform: instant
                              ? "none"
                              : "translate(0px, 18px) scale(.92)",
                            transition: {
                              duration: instant ? 0 : 0.14,
                              ease: easeOut,
                            },
                          }}
                          transition={
                            instant
                              ? { duration: 0 }
                              : {
                                  ...spring,
                                  duration: 0.4,
                                  delay: index * 0.025,
                                }
                          }
                          onClick={() => {
                            handoff.current = true;
                            if (motionTrigger)
                              motionTrigger.current = trigger.current;
                            setOpen(false);
                            onAdd(kind);
                          }}
                        >
                          <span className="radial-action-disc">
                            <Icon size={23} aria-hidden="true" />
                          </span>
                          <span>{label}</span>
                        </motion.button>
                      ),
                    )}
                    <Popover.Close asChild>
                      <button
                        type="button"
                        className="radial-add-center"
                        aria-label="Close add menu"
                      >
                        <X size={20} aria-hidden="true" />
                      </button>
                    </Popover.Close>
                  </div>
                </motion.div>
              </Popover.Content>
            </Popover.Portal>
          )}
        </AnimatePresence>
      </Popover.Root>
    </div>
  );
}
