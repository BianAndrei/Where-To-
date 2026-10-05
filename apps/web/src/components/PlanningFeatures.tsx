import { useId, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
} from "@phosphor-icons/react";
import { Doodle, type DoodleName } from "./Doodle";
import { MotionChoice, MotionGroup, MotionPanel } from "./motion";

const tools = [
  {
    id: "bookings",
    label: "Your bookings",
    hint: "Every confirmation, together",
    icon: "suitcase",
    colour: "#FFD69A",
    title: "Booked? Bring it along.",
    description:
      "Import hotel, train and activity confirmations from a PDF, photo or text. Check the details, then save the reservation, cost and private document together.",
    note: "Duplicate checks help keep one booking from becoming two expenses.",
  },
  {
    id: "transfers",
    label: "The way there",
    hint: "From arrivals to your door",
    icon: "train",
    colour: "#CBDDF0",
    title: "Landing is only the beginning.",
    description:
      "Compare train, bus and taxi transfers by duration, changes and cost for your whole group. Your chosen journey joins the itinerary and budget.",
    note: "Look up routes where connected services are available, or enter an operator’s estimate.",
  },
  {
    id: "receipts",
    label: "A fair share",
    hint: "Split the meal, item by item",
    icon: "meal",
    colour: "#E8ACA0",
    title: "You had the pasta.",
    description:
      "Read a photo of the receipt, check the prices and choose who had what. The final bill updates the meal already in your plan and keeps its existing payments.",
    note: "Shared dishes split between the people you choose. No second meal in the budget.",
  },
  {
    id: "votes",
    label: "Group decisions",
    hint: "Find everyone’s favourite",
    icon: "sun",
    colour: "#FFD69A",
    title: "Less back-and-forth.",
    description:
      "Let your collaborators vote on saved restaurants and activities, with the costs in view. The organiser confirms the choice and the day.",
    note: "Only the confirmed choice joins your itinerary and budget. The other options stay as ideas.",
  },
  {
    id: "packing",
    label: "What to pack",
    hint: "A list that fits your plans",
    icon: "suitcase",
    colour: "#CDE5D4",
    title: "Less “did we forget…?”",
    description:
      "A beach day needs different things from a mountain walk. Pick checklist suggestions based on your trip length and activities, then tick them off as you pack.",
    note: "You choose what to add. Things already on your checklist won’t be added twice.",
  },
  {
    id: "missing",
    label: "The loose ends",
    hint: "Know what still needs you",
    icon: "map",
    colour: "#CDE5D4",
    title: "Leave with a clearer head.",
    description:
      "Spot a night without a stay, an airport transfer still to plan, an unpriced activity or a payment due soon. Go straight to the detail that needs attention.",
    note: "Reminders use the plan you’ve saved, so you can decide what to organise next.",
  },
] satisfies {
  id: string;
  label: string;
  hint: string;
  icon: DoodleName;
  colour: string;
  title: string;
  description: string;
  note: string;
}[];

function Preview({ kind }: { kind: string }) {
  if (kind === "bookings")
    return (
      <div className="folio-bookings">
        <div className="folio-subhead">
          <span>YOUR LISBON GETAWAY</span>
          <span>3 reservations</span>
        </div>
        {[
          {
            icon: "suitcase",
            title: "A stay to look forward to",
            sub: "Oct 12–15 · confirmation attached",
            price: "€420",
          },
          {
            icon: "train",
            title: "Airport train",
            sub: "Oct 12 · tickets attached",
            price: "€18",
          },
          {
            icon: "sun",
            title: "A sunset on the water",
            sub: "Oct 13 · confirmation attached",
            price: "€70",
          },
        ].map((b) => (
          <div className="folio-booking" key={b.title}>
            <Doodle name={b.icon as DoodleName} />
            <div>
              <b>{b.title}</b>
              <small>{b.sub}</small>
            </div>
            <strong>{b.price}</strong>
          </div>
        ))}
        <div className="folio-footer">
          <FileText size={17} />
          <span>The details. The document. The cost.</span>
          <Check size={17} />
        </div>
      </div>
    );
  if (kind === "transfers")
    return (
      <div className="folio-transfers">
        <div className="folio-subhead">
          <span>AIRPORT → YOUR STAY</span>
          <span>2 travellers</span>
        </div>
        <div className="folio-journey">
          <span>Arrivals</span>
          <div>
            <Doodle name="train" colour="#CBDDF0" />
          </div>
          <span>Check-in</span>
        </div>
        <div className="folio-route-options">
          {[
            { title: "Train", cost: 18, time: "45 min", changes: "1 change" },
            { title: "Bus", cost: 12, time: "55 min", changes: "Direct" },
            { title: "Taxi", cost: 32, time: "25 min", changes: "Direct" },
          ].map((x, i) => (
            <div key={x.title} data-picked={i === 0}>
              <b>{x.title}</b>
              <strong>€{x.cost}</strong>
              <span>{x.time}</span>
              <small>{x.changes}</small>
            </div>
          ))}
        </div>
        <div className="folio-footer">
          <Check size={17} />
          <span>Compare the cost for everyone.</span>
        </div>
      </div>
    );
  if (kind === "receipts")
    return (
      <div className="folio-receipt">
        <div className="folio-subhead">
          <span>DINNER, WITH A VIEW</span>
          <span>Receipt checked</span>
        </div>
        {[
          ["Pasta", "Alex", "€14"],
          ["Salad", "Sam", "€10"],
          ["Drinks", "Shared", "€8"],
        ].map(([dish, person, price]) => (
          <div className="folio-bill-row" key={dish}>
            <b>{dish}</b>
            <span>{person}</span>
            <strong>{price}</strong>
          </div>
        ))}
        <div className="folio-shares">
          <div>
            <span className="folio-avatar">A</span>
            <span>
              Alex<strong>€18</strong>
            </span>
          </div>
          <div>
            <span className="folio-avatar">S</span>
            <span>
              Sam<strong>€14</strong>
            </span>
          </div>
        </div>
        <div className="folio-footer">
          <span>One meal in the budget</span>
          <b>€32 total</b>
        </div>
      </div>
    );
  if (kind === "votes")
    return (
      <div className="folio-votes">
        <div className="folio-subhead">
          <span>LET’S PICK AN AFTERNOON</span>
          <span>Group poll</span>
        </div>
        <div className="folio-vote">
          <Doodle name="sun" />
          <div>
            <b>Sunset boat trip</b>
            <small>€70 for the group · 1 vote</small>
          </div>
        </div>
        <div className="folio-vote is-favourite">
          <Doodle name="map" colour="#CBDDF0" />
          <div>
            <b>An afternoon at the aquarium</b>
            <small>€50 for the group · 2 votes</small>
          </div>
          <Check size={19} />
        </div>
        <div className="folio-voters">
          <span className="folio-avatar">A</span>
          <span className="folio-avatar">S</span>
          <span className="folio-avatar">J</span>
          <span>Everyone gets a say.</span>
        </div>
        <div className="folio-footer">
          <span>The organiser confirms what joins the plan.</span>
        </div>
      </div>
    );
  if (kind === "packing")
    return (
      <div className="folio-packing">
        <div className="folio-subhead">
          <span>FOUR DAYS AWAY</span>
          <span>City + beach</span>
        </div>
        {[
          ["Passport & travel documents", true],
          ["Comfy shoes for the hills", true],
          ["Swimwear & a small towel", false],
          ["Phone charger", false],
        ].map(([label, done]) => (
          <div className="folio-pack-row" key={String(label)} data-done={done}>
            <span className="folio-tick">{done && <Check size={15} />}</span>
            <span>{label}</span>
          </div>
        ))}
        <div className="folio-footer">
          <Doodle name="sun" />
          <span>A beach day? There’s a suggestion for that.</span>
        </div>
      </div>
    );
  return (
    <div className="folio-missing">
      <div className="folio-subhead">
        <span>BEFORE YOU HEAD OFF</span>
        <span>2 loose ends</span>
      </div>
      <div className="folio-ready">
        <Check size={19} />
        <span>Every night has a place to stay.</span>
      </div>
      <div className="folio-loose">
        <Doodle name="train" />
        <div>
          <b>Airport to your stay</b>
          <small>Choose how you’ll get there.</small>
        </div>
        <ArrowRight size={19} />
      </div>
      <div className="folio-loose">
        <Doodle name="wallet" colour="#CBDDF0" />
        <div>
          <b>Stay balance · €150</b>
          <small>Payment due October 10.</small>
        </div>
        <ArrowRight size={19} />
      </div>
      <div className="folio-footer">
        <span>A useful next step, right where you need it.</span>
      </div>
    </div>
  );
}

export default function PlanningFeatures({
  paused = false,
}: {
  paused?: boolean;
}) {
  const [active, setActive] = useState(0),
    [instant, setInstant] = useState(true);
  const reduced = useReducedMotion();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  const tool = tools[active]!;
  return (
    <section
      className="wt-toolbox wt-shell"
      id="travel-tools"
      aria-labelledby="planning-features-title"
    >
      <div className="wt-section-heading">
        <div>
          <span className="wt-label">THE DETAILS, FIGURED OUT</span>
          <h2 id="planning-features-title">
            Less organising.
            <br />
            <span className="rose-ink">More looking forward.</span>
          </h2>
        </div>
        <p>
          Your bookings, your people and the loose ends — all in one place.
          <strong>All included in your first free trip.</strong>
        </p>
      </div>
      <div
        className="wt-toolbox-desk"
        style={{ "--folio-colour": tool.colour } as CSSProperties}
      >
        <div
          className="wt-tool-tabs"
          role="tablist"
          aria-label="Explore the travel tools"
        >
          <MotionGroup>
            {tools.map((t, i) => (
              <MotionChoice
                active={active === i}
                instant={instant || paused}
                key={t.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${id}-${t.id}-tab`}
                aria-controls={`${id}-${t.id}-panel`}
                aria-selected={active === i}
                tabIndex={active === i ? 0 : -1}
                onClick={(e) => {
                  setInstant(e.detail === 0);
                  setActive(i);
                }}
                onKeyDown={(e) => {
                  let next = i;
                  if (e.key === "ArrowDown" || e.key === "ArrowRight")
                    next = (i + 1) % tools.length;
                  else if (e.key === "ArrowUp" || e.key === "ArrowLeft")
                    next = (i - 1 + tools.length) % tools.length;
                  else if (e.key === "Home") next = 0;
                  else if (e.key === "End") next = tools.length - 1;
                  else return;
                  e.preventDefault();
                  setInstant(true);
                  setActive(next);
                  tabs.current[next]?.focus({ preventScroll: true });
                }}
              >
                <Doodle name={t.icon} colour={t.colour} />
                <span>
                  <b>{t.label}</b>
                  <small>{t.hint}</small>
                </span>
                <ArrowRight size={18} />
              </MotionChoice>
            ))}
          </MotionGroup>
        </div>
        <MotionPanel
          changeKey={active}
          order={active}
          resize
          distance={16}
          instant={instant || !!reduced || paused}
          className="wt-tool-panels"
        >
          {tools.map((t, i) => (
            <div
              key={t.id}
              role="tabpanel"
              id={`${id}-${t.id}-panel`}
              aria-labelledby={`${id}-${t.id}-tab`}
              hidden={active !== i}
              tabIndex={0}
            >
              {active === i && (
                <div>
                  <div className="folio-intro">
                    <h3>{t.title}</h3>
                    <p>{t.description}</p>
                  </div>
                  <div className="folio-example">
                    <Preview kind={t.id} />
                    <span className="folio-example-label">
                      ILLUSTRATIVE EXAMPLE · SAMPLE DETAILS & PRICES
                    </span>
                  </div>
                  <p className="folio-note">{t.note}</p>
                </div>
              )}
            </div>
          ))}
        </MotionPanel>
      </div>
      <div className="wt-toolbox-bottom">
        <span>
          Less scattered across your tabs. More together in your trip.
        </span>
        <Link to="/demo" className="wt-inline-link">
          Try the planner <ArrowUpRight size={20} />
        </Link>
      </div>
    </section>
  );
}
