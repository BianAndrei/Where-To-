import { useId, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  ArrowRight,
  Check,
  Plus,
  Minus,
  Pause,
  Play,
} from "@phosphor-icons/react";
import { Doodle, Logo, TravelDrawing } from "../components/Doodle";
import WaveMenu from "../components/archive/WaveMenu";
import AnimatedHeader from "../components/archive/AnimatedHeader";
import ClipPostcards from "../components/archive/ClipPostcards";
import TiltedCard from "../components/react-bits/TiltedCard";
import ReservationStory from "../components/ReservationStory";
import PlanningFeatures from "../components/PlanningFeatures";
import BudgetPlayground from "../components/BudgetPlayground";
import {
  MotionChoice,
  MotionGroup,
  MotionPanel,
  RollingValue,
  Reveal,
} from "../components/motion";
import "./landing.css";
import "./landing-polish.css";
import { SiteIntro } from "../components/JourneyAtmosphere";
import { publicAsset } from "../lib/deployment";

export function MarketingNav() {
  return (
    <header className="wt-nav">
      <Link to="/" aria-label="Whereto home">
        <Logo />
      </Link>
      <nav className="wt-nav-links" aria-label="Main navigation">
        <a href={publicAsset("#how-it-works")}>The planner</a>
        <a href={publicAsset("#travel-tools")}>What’s inside</a>
        <Link to="/pricing">Pricing</Link>
      </nav>
      <div className="wt-nav-actions">
        <Link to="/login">
          Log in <ArrowUpRight size={17} />
        </Link>
        <WaveMenu />
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="wt-footer">
      <div>
        <Link to="/" aria-label="Whereto home">
          <Logo layout="stacked" />
        </Link>
        <p>
          More room for adventure.
          <br />A lot less figuring it out.
        </p>
      </div>
      <nav aria-label="Footer">
        <Link to="/demo">Try the planner</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/privacy">Privacy</Link>
        <Link to="/terms">Terms</Link>
      </nav>
      <span>© {new Date().getFullYear()} Whereto</span>
    </footer>
  );
}
export function PriceCards() {
  return (
    <div className="price-cards wt-prices">
      <article className="price-card free">
        <div className="fare-top">
          <span className="wt-label">THE FIRST TRIP</span>
          <Doodle name="plane" colour="#CBDDF0" />
        </div>
        <h3>Go on. It’s on us.</h3>
        <div className="price-number">
          €0 <small>/ your first trip</small>
        </div>
        <p>A complete plan, from the first idea to the last espresso.</p>
        <ul>
          {[
            "Full itinerary & budget planner",
            "Maps, collaboration & PDF / PNG exports",
            "10 successful menu imports",
            "No card. No ticking trial.",
          ].map((text) => (
            <li key={text}>
              <Check size={18} />
              {text}
            </li>
          ))}
        </ul>
        <Link to="/signup" className="button button-primary">
          Plan your first trip free <ArrowUpRight size={18} />
        </Link>
      </article>
      <article className="price-card pro">
        <div className="fare-top">
          <span className="wt-label">EVERYWHERE AFTER THAT</span>
          <Doodle name="suitcase" colour="#CDE5D4" />
        </div>
        <h3>Keep the good trips coming.</h3>
        <div className="price-number">
          €5 <small>/ month, or €40 / year</small>
        </div>
        <p>For your next city, a month abroad, or a route across continents.</p>
        <ul>
          {[
            "Create more trips while subscribed",
            "Everything in your first free trip",
            "30 successful menu imports each month",
            "Existing trips stay editable after cancelling",
          ].map((text) => (
            <li key={text}>
              <Check size={18} />
              {text}
            </li>
          ))}
        </ul>
        <Link to="/pricing" className="button button-secondary">
          See the plans <ArrowUpRight size={18} />
        </Link>
      </article>
    </div>
  );
}
function MenuExample() {
  const [english, setEnglish] = useState(true);
  const [quantity, setQuantity] = useState(2);
  return (
    <div className="menu-sample">
      <div className="menu-sample-heading">
        <span>{english ? "At the table" : "À mesa"}</span>
        <div role="group" aria-label="Example menu language">
          <MotionGroup>
            <MotionChoice active={!english} onClick={() => setEnglish(false)}>
              PT
            </MotionChoice>
            <MotionChoice active={english} onClick={() => setEnglish(true)}>
              EN
            </MotionChoice>
          </MotionGroup>
        </div>
      </div>
      <div className="menu-sample-rule" />
      <MotionPanel
        changeKey={english ? "en" : "pt"}
        order={english ? 1 : 0}
        resize
        distance={8}
        className="menu-description"
      >
        <span className="wt-label">
          {english ? "SOMETHING SWEET" : "ALGO DOCE"}
        </span>
        <h3>{english ? "Portuguese custard tart" : "Pastel de nata"}</h3>
        <p>
          {english
            ? "Flaky pastry. Warm custard. A touch of cinnamon."
            : "Massa folhada. Creme quente. Um pouco de canela."}
        </p>
        <span className="original-dish">
          {english
            ? "Original name: Pastel de nata"
            : "Nome original: Pastel de nata"}
        </span>
      </MotionPanel>
      <div className="menu-quantity">
        <b>
          €2.00 <small>each</small>
        </b>
        <div>
          <button
            aria-label="Remove one tart"
            disabled={quantity === 1}
            onClick={() => setQuantity(quantity - 1)}
          >
            <Minus size={18} />
          </button>
          <output aria-live="polite">
            <RollingValue>{quantity}</RollingValue>
          </output>
          <button
            aria-label="Add one tart"
            disabled={quantity === 12}
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
      <div className="menu-estimate">
        <span>Meal estimate</span>
        <strong aria-live="polite">
          <RollingValue>{`€${(quantity * 2).toFixed(2)}`}</RollingValue>
        </strong>
        <Check size={20} />
      </div>
      <small className="sample-disclaimer">
        Example menu & prices · an estimate, not an order
      </small>
    </div>
  );
}
function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  const [instant, setInstant] = useState(false);
  const id = useId();
  return (
    <div className="wt-faq-item" data-open={open} data-instant={instant}>
      <h3 className="wt-faq-question">
        <button
          type="button"
          className="wt-faq-trigger"
          id={`${id}-question`}
          aria-expanded={open}
          aria-controls={`${id}-answer`}
          onClick={(event) => {
            setInstant(event.detail === 0);
            setOpen((previous) => !previous);
          }}
        >
          {question}
          <Plus size={21} aria-hidden="true" />
        </button>
      </h3>
      <div
        id={`${id}-answer`}
        className="wt-faq-answer"
        role="region"
        aria-labelledby={`${id}-question`}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="wt-faq-answer-clip">
          <p>{answer}</p>
        </div>
      </div>
    </div>
  );
}

const questions = [
  [
    "Is my first trip really free?",
    "Yes. A verified account gets one complete trip, including itinerary, budget, collaboration and exports, plus 10 successful menu imports. No card required. Deleting the trip does not reset the free allowance.",
  ],
  [
    "Can I change my destination?",
    "During setup, yes. Once you confirm, the destinations are fixed for every trip, including paid trips. Add all the cities you want to visit before confirming.",
  ],
  [
    "What if I cancel my subscription?",
    "Your existing trips stay editable and exportable. An active subscription is needed to create new trips and renew the monthly menu import allowance.",
  ],
  [
    "Can I book everything through Whereto?",
    "Travel bookings and payments happen with the provider, such as GetYourGuide or your train operator. Keep the details, tickets and costs together in your plan.",
  ],
  [
    "Will every restaurant menu work?",
    "Not every website or photo can be read reliably. Original names and sources stay visible. You confirm uncertain prices, and you can always enter an estimate yourself.",
  ],
];
export default function Landing() {
  const [paused, setPaused] = useState(false);
  return (
    <div className={`landing-page ${paused ? "motion-paused" : ""}`}>
      <SiteIntro />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <MarketingNav />
      <main id="main">
        <section className="wt-hero wt-shell" aria-labelledby="hero-heading">
          <div className="wt-hero-copy">
            <span className="wt-kicker">
              <span />
              Less figuring it out. More heading out.
            </span>
            <AnimatedHeader>
              <h1 id="hero-heading">
                A lovely trip.
                <br />
                <span className="rose-ink">A clear budget.</span>
              </h1>
            </AnimatedHeader>
            <p>
              The places you want to go. The things you want to do.
              <br className="desktop-break" /> And a budget that comes along for
              the ride.
            </p>
            <div className="wt-hero-actions">
              <Link to="/signup" className="button button-primary">
                Plan your first trip free <ArrowUpRight size={23} />
              </Link>
              <span className="wt-first-trip-note">
                First trip
                <br />
                is on us.
                <svg viewBox="0 0 96 44" fill="none" aria-hidden="true">
                  <path
                    className="wt-note-arrow-side"
                    d="M80 4C84 33 24 41 5 9M7 22L5 9L18 12"
                  />
                  <path
                    className="wt-note-arrow-up"
                    d="M88 35C53 48 19 37 17 5M7 17L17 5L27 15"
                  />
                </svg>
              </span>
            </div>
            <span className="wt-no-card">
              <Check size={16} /> No card required. Just somewhere to go.
            </span>
            <Link to="/demo" className="wt-hero-secondary">
              <span>
                <Play size={14} weight="fill" />
              </span>
              Try the planner first <ArrowRight size={17} />
            </Link>
          </div>
          <div className="wt-hero-art">
            <span className="wt-art-note">
              a change of scenery
              <br />
              looks good on you.
            </span>
            <TiltedCard disabled={paused}>
              <TravelDrawing />
            </TiltedCard>
          </div>
          <div className="wt-hero-bottom">
            <a href="#how-it-works">
              <ArrowDown size={18} /> Take a look around
            </a>
            <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
              {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
              {paused ? "Play illustrations" : "Pause illustrations"}
            </button>
          </div>
        </section>
        <section
          className="wt-demo-section wt-shell"
          id="how-it-works"
          aria-labelledby="demo-heading"
        >
          <div className="wt-section-heading">
            <div>
              <span className="wt-label">A PLAN THAT STAYS TOGETHER</span>
              <AnimatedHeader>
                <h2 id="demo-heading">
                  Your days. Your map.
                  <br />
                  Your money. <span className="rose-ink">All in sync.</span>
                </h2>
              </AnimatedHeader>
            </div>
            <p>
              Bring a reservation along and see the plan take shape.
              <br /> Dates, a place on the map, a clear cost — and what to
              organise next.
              <br />
              <strong>It’s that kind of simple.</strong>
            </p>
          </div>
          <ClipPostcards>
            <ReservationStory />
          </ClipPostcards>
          <Link to="/demo" className="wt-inline-link">
            Or jump straight into the full planner <ArrowRight size={20} />
          </Link>
        </section>
        <PlanningFeatures paused={paused} />
        <section
          className="wt-itinerary"
          id="features"
          aria-labelledby="itinerary-heading"
        >
          <div className="wt-shell wt-itinerary-inner">
            <div className="wt-map-art">
              <Doodle name="map" colour="#CDE5D4" flow />
            </div>
            <div className="wt-itinerary-copy">
              <span className="wt-label">MAKE ROOM FOR THE GOOD STUFF</span>
              <AnimatedHeader>
                <h2 id="itinerary-heading">
                  A plan that comes together.
                  <br />A lot of possibility.
                </h2>
              </AnimatedHeader>
              <p>
                Put your stay, restaurants and activities on a day-by-day map.
                Keep booking links with each stop, spot timing clashes and
                rearrange the day when plans change.
              </p>
              <div className="wt-day-snippets">
                <div>
                  <span>09:00</span>
                  <strong>Coffee, then see where the day goes.</strong>
                  <i className="mint-check">
                    <Check size={15} />
                  </i>
                </div>
                <div>
                  <span>11:00</span>
                  <strong>That museum you’ve been meaning to visit.</strong>
                  <i className="peach-check">
                    <Check size={15} />
                  </i>
                </div>
                <div>
                  <span>Later</span>
                  <strong>Leave room for a detour.</strong>
                  <i className="rose-check">
                    <Plus size={15} />
                  </i>
                </div>
              </div>
              <div className="wt-train-note">
                <Doodle name="train" colour="#FFD69A" flow />
                <div>
                  <strong>From one lovely stop to the next.</strong>
                  <p>
                    Keep train journeys, transfers and tickets in your plan.
                  </p>
                </div>
              </div>
              <Link to="/demo" className="wt-inline-link">
                Plan a day your way <ArrowUpRight size={20} />
              </Link>
            </div>
          </div>
        </section>
        <section
          className="wt-budget-section wt-shell"
          aria-labelledby="budget-heading"
        >
          <div className="wt-budget-copy">
            <span className="wt-label">THE NUMBERS, MINUS THE HEADACHE</span>
            <AnimatedHeader>
              <h2 id="budget-heading">
                More memories.
                <br />
                <span className="rose-ink">Fewer surprises.</span>
              </h2>
            </AnimatedHeader>
            <p>
              See estimates, confirmed costs and payments separately. A deposit
              reduces what you owe without adding the booking twice. Split costs
              between your people and see who owes whom.
            </p>
            <Link to="/demo?view=budget" className="wt-inline-link">
              Meet your travel budget <ArrowUpRight size={20} />
            </Link>
          </div>
          <BudgetPlayground paused={paused} />
        </section>
        <section className="wt-menu-section" aria-labelledby="menu-heading">
          <div className="wt-shell wt-menu-inner">
            <Reveal>
              <MenuExample />
            </Reveal>
            <div className="wt-menu-copy">
              <Doodle name="meal" colour="#FFD69A" flow />
              <span className="wt-label">A TASTE OF SOMEWHERE NEW</span>
              <AnimatedHeader>
                <h2 id="menu-heading">
                  Less “what’s that?”
                  <br />
                  More “yes, please.”
                </h2>
              </AnimatedHeader>
              <p>
                Import a restaurant menu or upload a photo. Read it in English,
                pick what sounds delicious, and bring the estimate into your
                plan.
              </p>
              <span className="wt-menu-footnote">
                Original names stay visible.
                <br />
                You check the prices before adding them.
              </span>
              <Link to="/signup" className="wt-inline-link">
                Bring your appetite <ArrowUpRight size={20} />
              </Link>
            </div>
          </div>
        </section>
        <section
          className="wt-pricing-section wt-shell"
          id="pricing"
          aria-labelledby="pricing-heading"
        >
          <div className="wt-pricing-heading">
            <Doodle name="plane" colour="#CBDDF0" flow />
            <span className="wt-label">
              WHEREVER YOU’RE GOING. MAKE IT YOURS.
            </span>
            <AnimatedHeader>
              <h2 id="pricing-heading">
                Your first trip?
                <br />
                <span className="rose-ink">That one’s on us.</span>
              </h2>
            </AnimatedHeader>
            <p>Make a real plan. Use every part. See how it feels.</p>
          </div>
          <Reveal>
            <PriceCards />
          </Reveal>
          <p className="wt-pricing-note">
            Your destinations are fixed once you confirm your trip.
            <br />
            If an automatic import is unavailable, you can always keep planning
            manually.
          </p>
        </section>
        <section className="wt-faq wt-shell" aria-labelledby="faq-heading">
          <div>
            <span className="wt-label">BEFORE YOU HEAD OFF</span>
            <h2 id="faq-heading">
              A few things
              <br />
              worth knowing.
            </h2>
            <Doodle name="suitcase" colour="#CDE5D4" flow />
          </div>
          <div className="wt-faq-list">
            {questions.map(([q, a]) => (
              <FaqItem key={q} question={q!} answer={a!} />
            ))}
          </div>
        </section>
        <section className="wt-final" aria-labelledby="final-heading">
          <Doodle name="sun" colour="#FFD69A" flow />
          <span className="wt-label">LET’S MAKE SOME GOOD MEMORIES</span>
          <h2 id="final-heading">So… where to?</h2>
          <Link to="/signup" className="button button-primary wt-main-cta">
            Plan your first trip free <ArrowUpRight size={23} />
          </Link>
          <p>No card required. Your first adventure is on us.</p>
          <Link to="/demo" className="wt-final-demo">
            Or make yourself at home in the demo <ArrowRight size={17} />
          </Link>
        </section>
      </main>
      <div className="wt-footer-band">
        <Footer />
      </div>
    </div>
  );
}
