import * as Popover from "@radix-ui/react-popover";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMotionTrigger } from "../motion";

type RailGroup = {
  label: string;
  icon: ReactNode;
  items: { label: string; icon: ReactNode; onSelect: () => void }[];
};

// Adapted from the App Sidebar 2 source supplied with this project (React Bits
// Pro). Portalled flyouts keep the rail scrollable without clipping its menus.
export default function AppSidebar2({ groups }: { groups: RailGroup[] }) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const handoff = useRef(false);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRefs = useRef(new Map<string, HTMLDivElement>());
  const motionTrigger = useMotionTrigger();
  const cancelClose = () => clearTimeout(timer.current);
  const closeSoon = () => {
    cancelClose();
    if (!pinned.current)
      timer.current = setTimeout(() => setOpenKey(null), 140);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <nav className="app-sidebar-2" aria-label="Trip tools">
      {groups.map((group) => (
        <Popover.Root
          key={group.label}
          open={openKey === group.label}
          onOpenChange={(open) => {
            cancelClose();
            pinned.current = open;
            handoff.current = false;
            setOpenKey(open ? group.label : null);
          }}
        >
          <Popover.Trigger asChild>
            <button
              ref={(node) => {
                if (node) triggerRefs.current.set(group.label, node);
              }}
              type="button"
              aria-label={group.label}
              aria-haspopup="menu"
              className="rail-group-trigger"
              onPointerEnter={(event) => {
                cancelClose();
                if (event.pointerType === "mouse" && !pinned.current) {
                  handoff.current = false;
                  setOpenKey(group.label);
                }
              }}
              onPointerLeave={closeSoon}
              onClick={(event) => {
                // A click pins a hover preview; a second click dismisses it.
                if (openKey === group.label && !pinned.current) {
                  event.preventDefault();
                  pinned.current = true;
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                  event.preventDefault();
                  pinned.current = true;
                  setOpenKey(group.label);
                  menuRefs.current
                    .get(group.label)
                    ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
                    ?.focus();
                }
              }}
            >
              {group.icon}
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              ref={(node) => {
                if (node) menuRefs.current.set(group.label, node);
              }}
              className="rail-flyout"
              role="menu"
              aria-label={group.label}
              side="right"
              align="start"
              sideOffset={12}
              collisionPadding={12}
              onPointerEnter={cancelClose}
              onPointerLeave={closeSoon}
              onOpenAutoFocus={(event) => {
                if (!pinned.current) event.preventDefault();
              }}
              onCloseAutoFocus={(event) => {
                if (!pinned.current || handoff.current) event.preventDefault();
              }}
              onEscapeKeyDown={() => {
                cancelClose();
                triggerRefs.current.get(group.label)?.focus();
              }}
              onKeyDown={(event) => {
                if (event.key === "Tab") {
                  pinned.current = false;
                  setOpenKey(null);
                  return;
                }
                if (
                  !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                )
                  return;
                event.preventDefault();
                const items = [
                  ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    '[role="menuitem"]',
                  ),
                ];
                const index = items.indexOf(
                  document.activeElement as HTMLButtonElement,
                );
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          items.length) %
                        items.length;
                items[next]?.focus();
              }}
            >
              <p className="rail-flyout-label">{group.label}</p>
              {group.items.map((item) => (
                <button
                  type="button"
                  role="menuitem"
                  key={item.label}
                  onClick={() => {
                    cancelClose();
                    handoff.current = true;
                    pinned.current = false;
                    if (motionTrigger)
                      motionTrigger.current =
                        triggerRefs.current.get(group.label) ?? null;
                    setOpenKey(null);
                    item.onSelect();
                  }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      ))}
    </nav>
  );
}
