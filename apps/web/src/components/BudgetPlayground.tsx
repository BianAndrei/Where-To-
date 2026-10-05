import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { Doodle } from "./Doodle";
import CountUp from "./react-bits/CountUp";
import { MotionChoice, MotionGroup } from "./motion";

export default function BudgetPlayground({
  paused = false,
}: {
  paused?: boolean;
}) {
  const [paid, setPaid] = useState(150),
    [instant, setInstant] = useState(true);
  return (
    <div className="wt-budget-playground" data-instant={instant || paused}>
      <div className="wt-budget-play-heading">
        <Doodle name="wallet" colour="#CBDDF0" flow />
        <div>
          <span className="wt-label">SEE HOW THE NUMBERS WORK</span>
          <p>What have you paid so far?</p>
        </div>
      </div>
      <div
        className="wt-payment-choices"
        role="group"
        aria-label="Example accommodation payment"
      >
        <MotionGroup>
          {[
            { value: 0, label: "Nothing yet" },
            { value: 150, label: "€150 deposit" },
            { value: 600, label: "Paid in full" },
          ].map((x) => (
            <MotionChoice
              key={x.value}
              active={paid === x.value}
              instant={instant || paused}
              onClick={(e) => {
                setInstant(e.detail === 0);
                setPaid(x.value);
              }}
            >
              {x.label}
            </MotionChoice>
          ))}
        </MotionGroup>
      </div>
      <div className="wt-receipt wt-play-receipt">
        <span className="wt-label">A STAY FOR TWO · THREE NIGHTS</span>
        <h3>
          One booking.
          <br />
          Counted once.
        </h3>
        <div>
          <span>Accommodation</span>
          <b>€600</b>
        </div>
        <div>
          <span>Already paid</span>
          <b>
            − €<CountUp to={paid} instant={instant || paused} />
          </b>
        </div>
        <div className="receipt-total">
          <span>Still to pay</span>
          <b>
            €<CountUp to={600 - paid} instant={instant || paused} />
          </b>
        </div>
        <div className="wt-payment-track" aria-hidden="true">
          <span style={{ transform: `scaleX(${paid / 600})` }} />
        </div>
        <p>
          <Check size={17} />
          {paid === 600
            ? "All paid. Still one €600 booking."
            : "The payment changes your balance, never the trip cost."}
        </p>
        <small>Interactive example · illustrative amounts</small>
      </div>
      <span className="sr-only" role="status">
        Accommodation costs 600 euros. Paid {paid} euros. Still to pay{" "}
        {600 - paid} euros.
      </span>
    </div>
  );
}
