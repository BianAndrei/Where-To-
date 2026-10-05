import * as Dialog from "@radix-ui/react-dialog";
import { X, ArrowRight, SpinnerGap } from "@phosphor-icons/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  useId,
  useRef,
  isValidElement,
  cloneElement,
  type ReactElement,
} from "react";
import { clsx } from "clsx";
import { Select } from "./Select";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { spring, easeOut, useInstantMotion, useMotionTrigger } from "./motion";
export function Button({
  children,
  variant = "primary",
  loading = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  const instant = useInstantMotion();
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      className={clsx("button", `button-${variant}`, className)}
    >
      <AnimatePresence initial={false}>
        {loading && (
          <motion.span
            className="button-loading-icon"
            initial={instant ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: instant ? 1 : 0.8 }}
            transition={instant ? { duration: 0 } : spring}
          >
            <SpinnerGap className="spin" size={18} />
          </motion.span>
        )}
      </AnimatePresence>
      {children}
    </button>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const instant = useInstantMotion();
  const trigger = useMotionTrigger();
  // React autoFocus can focus a child before Radix emits onOpenAutoFocus.
  // Capture the opener on mount too, so those dialogs restore focus reliably.
  const opener = useRef<HTMLElement | null>(
    trigger?.current ??
      (typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null),
  );
  const content = useRef<HTMLDivElement | null>(null);
  const present = useIsPresent();
  return (
    <Dialog.Root open={open && present} onOpenChange={onOpenChange}>
      <AnimatePresence propagate>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay forceMount asChild>
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: instant ? 0 : 0.25, ease: easeOut }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              forceMount
              asChild
              onOpenAutoFocus={() => {
                opener.current =
                  trigger?.current ??
                  (document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null);
              }}
              onCloseAutoFocus={(event) => {
                onCloseAutoFocus?.(event);
                if (event.defaultPrevented) return;
                // A quick-add dialog can hand focus directly to the full editor.
                // Do not let the departing dialog steal that new focus.
                const active = document.activeElement;
                if (
                  active instanceof HTMLElement &&
                  active !== document.body &&
                  active !== document.documentElement &&
                  active !== opener.current &&
                  !content.current?.contains(active)
                ) {
                  event.preventDefault();
                } else if (opener.current?.isConnected) {
                  event.preventDefault();
                  opener.current.focus({ preventScroll: true });
                }
              }}
            >
              <motion.div
                ref={content}
                inert={!open || !present}
                className={`modal-content ${wide ? "modal-wide" : ""}`}
                initial={
                  instant
                    ? false
                    : {
                        opacity: 0,
                        transform:
                          "translate(-50%, -50%) translateY(8px) scale(0.97)",
                      }
                }
                animate={{
                  opacity: 1,
                  transform: "translate(-50%, -50%) translateY(0px) scale(1)",
                }}
                exit={{
                  opacity: 0,
                  transform: instant
                    ? "translate(-50%, -50%)"
                    : "translate(-50%, -50%) translateY(8px) scale(0.97)",
                  transition: { duration: instant ? 0 : 0.18, ease: easeOut },
                }}
                transition={
                  instant ? { duration: 0 } : { duration: 0.28, ease: easeOut }
                }
              >
                <div className="modal-heading">
                  <div>
                    <Dialog.Title>{title}</Dialog.Title>
                    <Dialog.Description
                      className={description ? "muted" : "sr-only"}
                    >
                      {description ?? title}
                    </Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <button aria-label="Close dialog" className="icon-button">
                      <X size={23} />
                    </button>
                  </Dialog.Close>
                </div>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const fieldId = useId();
  const direct =
    isValidElement(children) &&
    (children.type === Select ||
      (typeof children.type === "string" &&
        ["input", "select", "textarea"].includes(children.type)));
  return (
    <div
      className="field"
      role={direct ? undefined : "group"}
      aria-labelledby={direct ? undefined : fieldId + "-label"}
    >
      {direct ? (
        <label htmlFor={fieldId}>{label}</label>
      ) : (
        <span id={fieldId + "-label"}>{label}</span>
      )}
      {direct
        ? cloneElement(children as ReactElement<any>, {
            id: fieldId,
            "aria-describedby": hint ? fieldId + "-hint" : undefined,
          })
        : children}
      {hint && <small id={fieldId + "-hint"}>{hint}</small>}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "notice-error" : ""}`}
    >
      {children}
    </div>
  );
}
export function Arrow() {
  return <ArrowRight size={20} weight="bold" />;
}
