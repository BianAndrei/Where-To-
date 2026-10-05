import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Logo, Doodle } from "./Doodle";
import { easeFlow, easeOut, useInstantMotion } from "./motion";
import "../pages/onboarding-experience.css";

const poses = [
  [
    "translate(-18vw, -35vh) rotate(-20deg)",
    "translate(75vw, 62vh) rotate(25deg)",
    "translate(2vw, 72vh) rotate(-40deg)",
  ],
  [
    "translate(65vw, -38vh) rotate(70deg)",
    "translate(-20vw, 48vh) rotate(-25deg)",
    "translate(55vw, 68vh) rotate(30deg)",
  ],
  [
    "translate(65vw, 60vh) rotate(130deg)",
    "translate(0vw, -37vh) rotate(30deg)",
    "translate(-15vw, 58vh) rotate(100deg)",
  ],
  [
    "translate(-15vw, 50vh) rotate(190deg)",
    "translate(75vw, -27vh) rotate(85deg)",
    "translate(45vw, 75vh) rotate(170deg)",
  ],
];
export function JourneyAtmosphere({ step = 0 }: { step?: number }) {
  const instant = useInstantMotion();
  return (
    <div className="journey-atmosphere" aria-hidden="true">
      {(poses[step % 4] ?? poses[0]!).map((transform, index) => (
        <motion.div
          key={index}
          className={`journey-blob journey-blob-${index}`}
          initial={
            instant
              ? false
              : { opacity: 0, transform: "translate(25vw, 20vh) rotate(0deg)" }
          }
          animate={{ transform, opacity: 0.55 }}
          transition={{ duration: instant ? 0 : 1.15, ease: easeFlow }}
        />
      ))}
    </div>
  );
}

export function SiteIntro() {
  const instant = useInstantMotion();
  const [open, setOpen] = useState(() => {
    try {
      return !sessionStorage.getItem("whereto-intro-seen") && !location.hash;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("whereto-intro-seen", "true");
    } catch {}
    const finish = () => setOpen(false);
    const timer = window.setTimeout(finish, 1150);
    window.addEventListener("keydown", finish, { once: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", finish);
    };
  }, []);
  return (
    <AnimatePresence>
      {open && !instant && (
        <motion.div
          className="site-intro"
          initial={{
            opacity: 1,
            clipPath: "inset(0% 0% 0% 0% round 0% 0% 0% 0%)",
          }}
          animate={{
            opacity: 1,
            clipPath: "inset(0% 0% 0% 0% round 0% 0% 0% 0%)",
          }}
          exit={{
            opacity: 0,
            clipPath: "inset(0% 0% 100% 0% round 0% 0% 45% 45%)",
          }}
          transition={{ duration: 0.6, ease: easeFlow }}
        >
          <JourneyAtmosphere />
          <div className="site-intro-center" aria-hidden="true">
            <motion.div
              initial={{ opacity: 0, transform: "translateY(18px) scale(.94)" }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              transition={{ duration: 0.65, ease: easeOut }}
            >
              <Logo />
            </motion.div>
            <div className="intro-stamps">
              {(["map", "suitcase", "sun"] as const).map((name, index) => (
                <motion.div
                  key={name}
                  initial={{
                    opacity: 0,
                    transform: "translateY(22px) rotate(-12deg)",
                  }}
                  animate={{
                    opacity: 1,
                    transform: "translateY(0px) rotate(0deg)",
                  }}
                  transition={{
                    duration: 0.6,
                    delay: 0.12 + index * 0.08,
                    ease: easeOut,
                  }}
                >
                  <Doodle name={name} />
                </motion.div>
              ))}
            </div>
            <p>Every adventure starts somewhere.</p>
          </div>
          <button className="intro-skip" onClick={() => setOpen(false)}>
            Skip intro <span aria-hidden="true">↗</span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
