import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown, Check, Users } from "@phosphor-icons/react";
import { AvatarStack, TravellerAvatar } from "./PlayfulControls";
import { easeOut, softSpring, useInstantMotion } from "./motion";

export default function TravellerPicker({
  people,
  value,
  onChange,
}: {
  people: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const instant = useInstantMotion();
  // Empty is the data model's existing shorthand for the entire group.
  const selected = value.length
    ? people.filter((p) => value.includes(p.id))
    : people;
  const everyone = selected.length === people.length;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="traveller-picker-trigger"
          aria-label="Choose travellers"
        >
          <AvatarStack people={selected} />
          <span>
            {everyone
              ? "Everyone"
              : `${selected.length} ${selected.length === 1 ? "traveller" : "travellers"}`}
            <small>
              {everyone
                ? "The whole group is included"
                : selected.map((p) => p.name).join(", ")}
            </small>
          </span>
          <CaretDown
            className="traveller-picker-chevron"
            size={18}
            aria-hidden="true"
          />
        </button>
      </Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              forceMount
              asChild
              align="start"
              sideOffset={8}
              collisionPadding={16}
              aria-label="Who’s joining?"
            >
              <motion.div
                className="traveller-picker-panel playful-popover"
                inert={!open}
                initial={
                  instant
                    ? false
                    : { opacity: 0, transform: "translateY(-6px) scale(.97)" }
                }
                animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
                exit={{
                  opacity: 0,
                  transform: "translateY(-4px) scale(.98)",
                  transition: { duration: instant ? 0 : 0.14, ease: easeOut },
                }}
                transition={instant ? { duration: 0 } : softSpring}
              >
                <div className="traveller-picker-heading">
                  <strong>Who’s joining?</strong>
                  <span>
                    {selected.length} of {people.length}
                  </span>
                </div>
                <button
                  type="button"
                  className="traveller-everyone"
                  onClick={() => onChange([])}
                  aria-pressed={everyone}
                >
                  <Users size={20} aria-hidden="true" /> Include everyone{" "}
                  <Check
                    size={17}
                    aria-hidden="true"
                    style={{ opacity: everyone ? 1 : 0 }}
                  />
                </button>
                <div className="traveller-picker-list">
                  {people.map((person) => {
                    const checked = selected.some((p) => p.id === person.id);
                    return (
                      <label
                        className="traveller-picker-option"
                        key={person.id}
                      >
                        <TravellerAvatar person={person} />
                        <span>{person.name}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={checked && selected.length === 1}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...selected.map((p) => p.id), person.id]
                              : selected
                                  .filter((p) => p.id !== person.id)
                                  .map((p) => p.id);
                            onChange(next.length === people.length ? [] : next);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="traveller-picker-footer">
                  <span>Keep at least one traveller.</span>
                  <Popover.Close asChild>
                    <button type="button">
                      Done <Check size={14} aria-hidden="true" />
                    </button>
                  </Popover.Close>
                </div>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
