// The postcard opens into a live preview and folds back into the same space.
// Both directions share one surface, including its changing content height.
import { useCallback, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Doodle } from "../Doodle";
import { MotionPanel } from "../motion";
export default function ClipPostcards({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const restoreFocus = useRef(false);
  // These refs run when the incoming content actually mounts, after the exit.
  // An effect on `open` would fire while only the outgoing content exists.
  const focusCover = useCallback((node: HTMLButtonElement | null) => {
    if (node && restoreFocus.current) node.focus({ preventScroll: true });
  }, []);
  const focusPreview = useCallback((node: HTMLDivElement | null) => {
    if (node) node.focus({ preventScroll: true });
  }, []);
  return (
    <div className="clip-postcards">
      <MotionPanel
        changeKey={open ? "preview" : "cover"}
        order={open ? 1 : 0}
        axis="y"
        distance={10}
        duration={0.12}
        resize
      >
        {!open ? (
          <button
            ref={focusCover}
            className="postcard-cover"
            type="button"
            aria-label="Try the interactive Lisbon demo"
            aria-expanded={false}
            aria-controls="trip-preview"
            onClick={() => {
              restoreFocus.current = true;
              setOpen(true);
            }}
          >
            <div className="postcard-side postcard-left">
              <Doodle name="meal" colour="#E8ACA0" flow />
              <span>Something delicious.</span>
            </div>
            <div className="postcard-centre">
              <span className="postcard-label">TRY THE INTERACTIVE DEMO</span>
              <strong>
                Olá,
                <br />
                <span className="postcard-city-name">Lisbon.</span>
              </strong>
              <span className="postcard-open">
                Open the demo <ArrowUpRight size={23} />
              </span>
              <span className="postcard-demo-hint">
                No account needed. Add a booking and see the plan come together.
              </span>
            </div>
            <div className="postcard-side postcard-right">
              <Doodle name="sun" colour="#CBDDF0" flow />
              <span>Nowhere to rush.</span>
            </div>
          </button>
        ) : (
          <div
            ref={focusPreview}
            id="trip-preview"
            className="clip-reveal"
            tabIndex={-1}
          >
            <div className="clip-reveal-inner">{children}</div>
          </div>
        )}
        {open && (
          <button className="close-preview" onClick={() => setOpen(false)}>
            Close the preview
          </button>
        )}
      </MotionPanel>
    </div>
  );
}
