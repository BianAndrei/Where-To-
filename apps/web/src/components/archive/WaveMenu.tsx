// code (6).zip: one baked SVG wave, followed by masked link reveals.
// A reversible timeline owns both directions; Radix stays modal until it ends.
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { List, X, ArrowUpRight } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";
import { Doodle, Logo } from "../Doodle";

let motionModule: Promise<typeof import("gsap")> | undefined;
function loadMotion() {
  return (motionModule ??= import("gsap").catch((error) => {
    motionModule = undefined;
    throw error;
  }));
}
type Timeline = ReturnType<(typeof import("gsap"))["gsap"]["timeline"]>;
type ContentsProps = {
  open: boolean;
  instant: boolean;
  backdrop: RefObject<HTMLDivElement | null>;
  onExit: () => void;
  onKeyboardClose: () => void;
  onNavigate: (event: MouseEvent<HTMLAnchorElement>) => void;
  onCloseAutoFocus: (event: Event) => void;
};

const WaveContents = forwardRef<HTMLDivElement, ContentsProps>(
  function WaveContents(
    {
      open,
      instant,
      backdrop,
      onExit,
      onKeyboardClose,
      onNavigate,
      onCloseAutoFocus,
    },
    forwardedRef,
  ) {
    const ref = useRef<HTMLDivElement>(null);
    const timeline = useRef<Timeline | null>(null);
    const latest = useRef({ open, onExit });
    const [motionFailed, setMotionFailed] = useState(false);
    const noMotion = instant || motionFailed;
    const setContentRef = useCallback(
      (node: HTMLDivElement | null) => {
        ref.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );
    useLayoutEffect(() => {
      latest.current = { open, onExit };
    }, [open, onExit]);

    useLayoutEffect(() => {
      const node = ref.current;
      if (!node || noMotion) return;
      let disposed = false;
      let cleanup: (() => void) | undefined;
      void loadMotion()
        .then(({ gsap }) => {
          if (disposed) return;
          const context = gsap.context(() => {
            // CSS supplies these same hidden states before the module is ready.
            gsap.set(".wave-sheet", { y: 0, yPercent: -100 });
            gsap.set(".wave-menu-top,.wave-menu-bottom", {
              autoAlpha: 0,
              y: 10,
            });
            gsap.set(".wave-menu-link", { autoAlpha: 0, y: 0, yPercent: 100 });
            gsap.set(".wave-menu-aside", { autoAlpha: 0, y: 12 });
            const sequence = gsap.timeline({
              paused: true,
              onComplete: () => {
                node.dataset.phase = "open";
                if (document.activeElement === node) {
                  node
                    .querySelector<HTMLButtonElement>(".wave-close")
                    ?.focus({ preventScroll: true });
                }
              },
              onReverseComplete: () => {
                if (!latest.current.open) latest.current.onExit();
              },
            });
            if (backdrop.current)
              sequence.to(backdrop.current, { opacity: 1, duration: 0.18 }, 0);
            sequence
              .to(
                ".wave-sheet",
                { yPercent: 0, duration: 0.64, ease: "power3.inOut" },
                0,
              )
              .to(
                ".wave-menu-top",
                { autoAlpha: 1, y: 0, duration: 0.22, ease: "power2.out" },
                0.25,
              )
              .to(
                ".wave-menu-link",
                {
                  autoAlpha: 1,
                  yPercent: 0,
                  duration: 0.32,
                  stagger: 0.05,
                  ease: "power3.out",
                },
                0.29,
              )
              .to(
                ".wave-menu-aside",
                { autoAlpha: 1, y: 0, duration: 0.28, ease: "power2.out" },
                0.38,
              )
              .to(
                ".wave-menu-bottom",
                { autoAlpha: 1, y: 0, duration: 0.22, ease: "power2.out" },
                0.46,
              );
            timeline.current = sequence;
            if (latest.current.open) sequence.play();
            else latest.current.onExit();
          }, node);
          cleanup = () => context.revert();
        })
        .catch(() => {
          if (!disposed) setMotionFailed(true);
        });
      return () => {
        disposed = true;
        timeline.current = null;
        cleanup?.();
      };
    }, [backdrop, noMotion]);

    useLayoutEffect(() => {
      const node = ref.current;
      if (!node) return;
      node.dataset.phase = open ? (noMotion ? "open" : "opening") : "closing";
      if (noMotion) {
        if (!open) onExit();
        return;
      }
      const sequence = timeline.current;
      if (open) sequence?.timeScale(1).play();
      else if (!sequence || sequence.time() === 0) onExit();
      else sequence.timeScale(1.5).reverse();
    }, [open, noMotion, onExit]);

    return (
      <Dialog.Content
        ref={setContentRef}
        className="wave-menu-content"
        data-motion={noMotion ? "instant" : "animated"}
        data-phase={open ? "opening" : "closing"}
        onEscapeKeyDown={onKeyboardClose}
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          ref.current?.focus({ preventScroll: true });
        }}
      >
        <svg
          className="wave-sheet"
          viewBox="0 0 1440 1100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0 0H1440V1020C1170 1140 990 950 735 1010S280 1110 0 1010Z"
            fill="#CDE5D4"
          />
        </svg>
        <div className="wave-menu-scroll">
          <div className="wave-menu-top">
            <Link to="/" onClick={onNavigate}>
              <Logo />
            </Link>
            <Dialog.Close
              className="wave-close"
              onClick={(event) => {
                if (event.detail === 0) onKeyboardClose();
              }}
            >
              Close <X size={23} />
            </Dialog.Close>
          </div>
          <Dialog.Title className="sr-only">Explore Whereto</Dialog.Title>
          <Dialog.Description className="sr-only">
            Find the planner, features and pricing, or start your first trip.
          </Dialog.Description>
          <div className="wave-menu-body">
            <nav aria-label="Explore Whereto">
              {(
                [
                  ["The planner", "/#how-it-works"],
                  ["The good stuff", "/#features"],
                  ["Simple pricing", "/pricing"],
                  ["Your first trip", "/signup"],
                ] as const
              ).map(([label, url]) => (
                <div className="wave-link-mask" key={url}>
                  <Link
                    className="wave-menu-link"
                    to={url}
                    onClick={onNavigate}
                  >
                    {label}
                    <ArrowUpRight weight="bold" />
                  </Link>
                </div>
              ))}
            </nav>
            <aside className="wave-menu-aside">
              <Doodle name="suitcase" flow colour="#E8ACA0" />
              <p>
                Make room for
                <br />a change of scenery.
              </p>
              <Link to="/login" className="text-link" onClick={onNavigate}>
                Already planning? Log in <ArrowUpRight />
              </Link>
            </aside>
          </div>
          <div className="wave-menu-bottom">
            <span>First trip free. No card required.</span>
            <Link to="/pricing" onClick={onNavigate}>
              Find your plan ↗
            </Link>
          </div>
        </div>
      </Dialog.Content>
    );
  },
);

export default function WaveMenu() {
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const reduce = useReducedMotion();
  const backdrop = useRef<HTMLDivElement>(null);
  const pendingNavigation = useRef<string | null>(null);
  const navigating = useRef(false);
  const navigate = useNavigate();
  useLayoutEffect(() => {
    if (!present) return;
    return () => {
      document.documentElement.style.removeProperty("--wave-page-gutter");
    };
  }, [present]);
  const requestOpen = (next: boolean) => {
    if (next) {
      // Move the reserved scrollbar space into the page layout, so it no longer
      // clips the fixed overlay. Measure before mounting changes root overflow.
      const gutter = window.innerWidth - document.documentElement.clientWidth;
      document.documentElement.style.setProperty(
        "--wave-page-gutter",
        `${gutter}px`,
      );
      navigating.current = false;
      setPresent(true);
    }
    setOpen(next);
  };
  const finishClose = useCallback(() => {
    setPresent(false);
    const destination = pendingNavigation.current;
    pendingNavigation.current = null;
    if (destination) {
      navigate(destination);
      // Let the modal release its scroll lock before positioning the destination.
      requestAnimationFrame(() => {
        const hash = destination.split("#")[1];
        if (hash)
          document
            .getElementById(hash)
            ?.scrollIntoView({ behavior: "instant" });
        else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      });
    }
  }, [navigate]);
  const followLink = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    event.preventDefault();
    navigating.current = true;
    const target = new URL(event.currentTarget.href);
    pendingNavigation.current =
      "/" +
      target.pathname.slice(import.meta.env.BASE_URL.length) +
      target.search +
      target.hash;
    setKeyboard(event.detail === 0);
    setOpen(false);
  };
  const prefetchMotion = () => {
    void loadMotion().catch(() => {});
  };
  return (
    <Dialog.Root open={present} onOpenChange={requestOpen}>
      <Dialog.Trigger
        className="wave-trigger"
        aria-label="Open navigation"
        aria-expanded={open}
        onPointerEnter={prefetchMotion}
        onFocus={prefetchMotion}
        onClick={(event) => setKeyboard(event.detail === 0)}
      >
        Menu <List size={23} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay ref={backdrop} className="wave-menu-backdrop" />
        <WaveContents
          open={open}
          instant={!!reduce || keyboard}
          backdrop={backdrop}
          onExit={finishClose}
          onKeyboardClose={() => setKeyboard(true)}
          onNavigate={followLink}
          onCloseAutoFocus={(event) => {
            // Restoring the header trigger would scroll away from a hash target.
            if (navigating.current) event.preventDefault();
          }}
        />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
