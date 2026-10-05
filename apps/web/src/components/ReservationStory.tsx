import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { MotionPanel, RollingValue, easeOut, useInstantMotion } from "./motion";
import {
  ArrowRight,
  Check,
  ArrowCounterClockwise,
  FileText,
} from "@phosphor-icons/react";
import { Doodle } from "./Doodle";
export default function ReservationStory() {
  const [step, setStep] = useState(0);
  const reduced = useInstantMotion();
  const booked = step >= 2,
    transferred = step === 3;
  return (
    <div className="booking-story" aria-label="Interactive reservation example">
      <div className="booking-story-heading">
        <span className="wt-label">A FEW DAYS IN LISBON</span>
        <span>Interactive example · 2 people · sample prices</span>
      </div>
      <ol
        className="booking-story-progress"
        aria-label="Reservation demo progress"
      >
        {["Read", "Review", "In your plan", "Next step sorted"].map(
          (label, index) => (
            <li
              key={label}
              aria-current={step === index ? "step" : undefined}
              data-complete={step > index}
            >
              <span>{step > index ? <Check size={13} /> : index + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <div className="booking-story-grid">
        <div className="booking-paper">
          <span className="booking-paper-icon">
            <FileText size={23} />
            <span>SAMPLE CONFIRMATION</span>
          </span>
          <Doodle name="suitcase" />
          <h3>A stay to look forward to.</h3>
          <p>
            Lisbon · October 12–15
            <br />
            Three nights, two travellers.
          </p>
          <div className="booking-paper-total">
            <span>Total stay</span>
            <b>€420</b>
          </div>
          <span className="booking-paper-reference">
            Reference: EXAMPLE-123
          </span>
          <button
            className="button button-primary"
            disabled={step >= 2}
            onClick={() => setStep(step === 0 ? 1 : 2)}
          >
            {step === 0
              ? "Read sample confirmation"
              : step === 1
                ? "Confirm reservation"
                : "Reservation saved"}
            {step >= 2 ? <Check size={17} /> : <ArrowRight size={17} />}
          </button>
          {step === 1 && (
            <p className="booking-review-note" role="status">
              Name, dates and €420 found. Check them before adding this stay.
            </p>
          )}
          {step === 0 && <small>You always review before saving.</small>}
        </div>
        <div className="booking-story-plan">
          <span className="wt-label">YOUR DAY · OCTOBER 12</span>
          <h3>A soft landing.</h3>
          <div className="booking-story-stop">
            <span>11:25</span>
            <Doodle name="plane" />
            <div>
              <b>Arrive in Lisbon</b>
              <small>Flight already in your plan</small>
            </div>
          </div>
          <MotionPanel
            changeKey={booked ? "booked" : "empty"}
            axis="y"
            distance={4}
            duration={0.12}
          >
            {booked ? (
              <div className="booking-story-stop">
                <span>15:00</span>
                <Doodle name="suitcase" />
                <div>
                  <b>A stay to look forward to</b>
                  <small>3 nights · confirmation attached</small>
                </div>
                <b>€420</b>
              </div>
            ) : (
              <div className="booking-story-space">
                Your next reservation goes here.
              </div>
            )}
          </MotionPanel>
          <div
            className="booking-story-map"
            role="img"
            aria-label={
              booked
                ? "Illustrative route between Lisbon airport and the stay"
                : "Illustrative map of Lisbon airport"
            }
          >
            <svg viewBox="0 0 380 135" aria-hidden="true">
              <path
                d="M-10 98C90 170 245 31 400 85"
                stroke="#CBDDF0"
                strokeWidth="36"
                fill="none"
              />
              <path
                d="M36 0L104 135M135 0L206 135M245 0L294 135M0 55L380 28"
                stroke="#fffdf8"
                strokeWidth="9"
              />
              <AnimatePresence>
                {booked && (
                  <motion.g
                    key="connection"
                    initial={{ opacity: reduced ? 1 : 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                  >
                    <path
                      d="M80 45Q182 15 275 88"
                      fill="none"
                      stroke="#aaa694"
                      strokeWidth="3"
                      strokeDasharray="5 7"
                    />
                    <motion.path
                      d="M80 45Q182 15 275 88"
                      fill="none"
                      stroke="#6e8974"
                      strokeWidth="4"
                      strokeLinecap="round"
                      initial={false}
                      animate={{
                        pathLength: transferred ? 1 : 0,
                        opacity: transferred ? 1 : 0,
                      }}
                      transition={{
                        duration: reduced ? 0 : 0.5,
                        ease: easeOut,
                      }}
                    />
                  </motion.g>
                )}
              </AnimatePresence>
              <circle
                cx="80"
                cy="45"
                r="17"
                fill="#FFD69A"
                stroke="#292823"
                strokeWidth="2"
              />
              <text x="80" y="50" textAnchor="middle" fontSize="13">
                1
              </text>
              <AnimatePresence>
                {booked && (
                  <motion.g
                    key="destination"
                    initial={
                      reduced
                        ? false
                        : { opacity: 0, transform: "translateY(-5px)" }
                    }
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.3, ease: easeOut }}
                  >
                    <circle
                      cx="275"
                      cy="88"
                      r="17"
                      fill="#CDE5D4"
                      stroke="#292823"
                      strokeWidth="2"
                    />
                    <text x="275" y="93" textAnchor="middle" fontSize="13">
                      2
                    </text>
                  </motion.g>
                )}
              </AnimatePresence>
            </svg>
            <span>
              Illustrative map · Airport{booked ? " → Your stay" : ""}
            </span>
          </div>
          <div className="booking-story-budget" aria-live="polite">
            <span>
              Added to the group budget
              <small>One reservation. Counted once.</small>
            </span>
            <strong>
              <RollingValue>{`€${transferred ? "438" : booked ? "420" : "0"}`}</RollingValue>
            </strong>
          </div>
        </div>
      </div>
      <MotionPanel
        changeKey={step}
        order={step}
        distance={4}
        duration={0.12}
        axis="y"
        className="booking-story-next"
        aria-live="polite"
      >
        <div>
          <span className="wt-label">WHAT’S STILL MISSING?</span>
          <p>
            {transferred
              ? "Your stay and airport transfer are in the plan."
              : booked
                ? "You have a flight and a stay. How will you get between them?"
                : "Add your stay to see what needs organising next."}
          </p>
        </div>
        {booked && !transferred ? (
          <button
            className="button button-secondary"
            onClick={() => setStep(3)}
          >
            Add example transfer · €18 <ArrowRight size={17} />
          </button>
        ) : transferred ? (
          <button className="plain-link" onClick={() => setStep(0)}>
            <ArrowCounterClockwise size={17} /> Try again
          </button>
        ) : (
          <Doodle name="map" />
        )}
      </MotionPanel>
    </div>
  );
}
