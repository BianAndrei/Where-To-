import { Select, SelectOption } from "../components/Select";
import {
  MotionPanel,
  MotionGroup,
  MotionChoice,
  RollingValue,
} from "../components/motion";
import { useState, useEffect, useRef } from "react";
import Decimal from "decimal.js";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LockKey,
  Minus,
  Plus,
  X,
  UsersThree,
  MapTrifold,
  Wallet,
  Sparkle,
  Question,
} from "@phosphor-icons/react";
import { freeTripState, makeId, type Place } from "@whereto/shared";
import { api, post, ApiError } from "../lib/api";
import { Logo, Doodle } from "../components/Doodle";
import { Button, Field, Notice } from "../components/ui";
import {
  LocationPicker,
  PlaceIcon,
  placeKindLabel,
  placeSubtitle,
} from "../components/LocationPicker";
import { AvatarStack } from "../components/PlayfulControls";
import { JourneyAtmosphere } from "../components/JourneyAtmosphere";
import { usePreferences } from "../lib/preferences";
import "./onboarding-experience.css";
function SetupQuestion({ children }: { children: React.ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={heading} className="setup-question" tabIndex={-1}>
      {children}
    </h1>
  );
}
const stepInfo = [
  {
    label: "Your people",
    Icon: UsersThree,
    doodle: "suitcase",
    note: "Good company. Great memories.",
    help: "Count everyone, including yourself. You can name your travel group and invite them from Your people once the trip is ready.",
  },
  {
    label: "Where & when",
    Icon: MapTrifold,
    doodle: "map",
    note: "One city or a whole new continent.",
    help: "Add each main city, then your first and last travel dates. You can plan day trips nearby. Main destinations are fixed after creation, so check the whole route.",
  },
  {
    label: "The budget",
    Icon: Wallet,
    doodle: "wallet",
    note: "More memories. Less mental maths.",
    help: "Leave the budget empty if you are still exploring. Choose a total for the group or an amount per person. Expenses can use different currencies; the main trip currency stays fixed.",
  },
  {
    label: "Your plan",
    Icon: Sparkle,
    doodle: "sun",
    note: "A space for your kind of adventure.",
    help: "Choose the view you want to start with. Review your dates and destinations, then confirm to create the trip. Your itinerary and budget are always available.",
  },
] as const;
const destinationCurrencies: Record<string, string> = {
  Portugal: "EUR",
  Romania: "RON",
  "United Kingdom": "GBP",
  "United States": "USD",
  Canada: "CAD",
  Australia: "AUD",
  Japan: "JPY",
  Switzerland: "CHF",
  Singapore: "SGD",
  Thailand: "THB",
  "New Zealand": "NZD",
  China: "CNY",
  India: "INR",
  "South Korea": "KRW",
  Mexico: "MXN",
  Brazil: "BRL",
  Poland: "PLN",
  Norway: "NOK",
  Sweden: "SEK",
  Denmark: "DKK",
};
export default function Onboarding() {
  const preferences = usePreferences();
  const [showHelp, setShowHelp] = useState(false);
  const [draftSaved, setDraftSaved] = useState(true);
  const navigate = useNavigate(),
    client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const [step, setStep] = useState(0),
    [name, setName] = useState(""),
    [people, setPeople] = useState(2),
    [places, setPlaces] = useState<Place[]>([]),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [departure, setDeparture] = useState(""),
    [budget, setBudget] = useState(""),
    [currency, setCurrency] = useState("EUR"),
    [perPerson, setPerPerson] = useState(false),
    [modules, setModules] = useState<"both" | "itinerary" | "budget">("both"),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const loaded = useRef("");
  const destinationCurrency = destinationCurrencies[places[0]?.country ?? ""];
  useEffect(() => {
    const userId = me.data?.user.id;
    if (!userId || loaded.current === userId) return;
    loaded.current = userId;
    try {
      const draft = JSON.parse(
        localStorage.getItem(`whereto-draft:${userId}`) || "null",
      );
      if (draft) {
        setName(draft.name || "");
        setPeople(
          Math.max(
            1,
            Math.min(50, Number.isInteger(draft.people) ? draft.people : 2),
          ),
        );
        setPlaces(draft.places || []);
        setStart(draft.start || "");
        setEnd(draft.end || "");
        setDeparture(draft.departure || "");
        setBudget(draft.budget || "");
        setCurrency(draft.currency || "EUR");
        setPerPerson(!!draft.perPerson);
        setModules(draft.modules || "both");
        setStep(
          Math.max(
            0,
            Math.min(3, Number.isInteger(draft.step) ? draft.step : 0),
          ),
        );
      } else {
        setName(me.data.user.name || "");
        setCurrency(me.data.preferences?.currency || preferences.currency);
        setDeparture(
          me.data.preferences?.departureCity || preferences.departureCity,
        );
      }
    } catch {
      /* A damaged local draft never blocks a fresh trip. */
    }
  }, [me.data?.user.id]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(
        `whereto-draft:${loaded.current}`,
        JSON.stringify({
          name,
          people,
          places,
          start,
          end,
          departure,
          budget,
          currency,
          perPerson,
          modules,
          step,
        }),
      );
      setDraftSaved(true);
    } catch {
      setDraftSaved(false);
    }
  }, [
    name,
    people,
    places,
    start,
    end,
    departure,
    budget,
    currency,
    perPerson,
    modules,
    step,
  ]);
  useEffect(() => {
    setShowHelp(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [step]);
  if (me.error instanceof ApiError && [401, 403].includes(me.error.status))
    return <Navigate to="/login?next=/app/new" />;
  const titles = [
    "Who’s coming along?",
    "Where are we wandering?",
    "Room for what matters.",
    "Make it your kind of trip.",
  ];
  const descriptions = [
    "Start with you. The rest of the names can wait.",
    "A weekend away or a journey across continents. Start with your route.",
    "An estimate is perfect. You can fine-tune it as you go.",
    "Choose what you need. You can switch views whenever you like.",
  ];
  function next() {
    setError("");
    if (step === 0 && !name.trim() && !me.data?.user.name) {
      setError("Tell us your name first.");
      return;
    }
    if (step === 1 && (!places.length || !start || !end || end < start)) {
      setError("Choose at least one destination and a valid travel period.");
      return;
    }
    setStep(step + 1);
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const organizer = name.trim() || me.data.user.name;
      const participants = Array.from({ length: people }, (_, i) => ({
        id: makeId(),
        name: i === 0 ? organizer : `Traveller ${i + 1}`,
      }));
      const state = freeTripState({
        organizer,
        destinations: places,
        startDate: start,
        endDate: end,
        departureCity: departure,
        participants,
        currency,
        budget: budget
          ? new Decimal(budget).mul(perPerson ? people : 1).toFixed(2)
          : null,
        modules,
      });
      const result = await post("/trips", state);
      try {
        localStorage.removeItem(`whereto-draft:${me.data.user.id}`);
      } catch {}
      await client.invalidateQueries({ queryKey: ["trips"] });
      await client.invalidateQueries({ queryKey: ["me"] });
      navigate(`/app/trips/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="onboarding setup-experience">
      <JourneyAtmosphere step={step} />
      <header className="app-header">
        <Link to="/">
          <Logo />
        </Link>
        <Link to="/app" className="text-link">
          <X size={18} /> Save for later
        </Link>
      </header>
      <main className="setup-main">
        <nav className="onboarding-progress" aria-label="Trip setup progress">
          {stepInfo.map(({ label, Icon }, i) => (
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              key={label}
              className={i <= step ? "current" : ""}
              aria-current={step === i ? "step" : undefined}
              aria-label={`Step ${i + 1}: ${label}${i < step ? ", completed" : ""}`}
            >
              <span>{i < step ? <Check size={19} /> : <Icon size={20} />}</span>
              <small>{label}</small>
            </button>
          ))}
        </nav>
        <div className="setup-workspace">
          <aside className="setup-art" aria-hidden="true">
            <MotionPanel changeKey={step} distance={8} duration={0.12}>
              <div className={`setup-illustration setup-illustration-${step}`}>
                <Doodle name={stepInfo[step]!.doodle} />
              </div>
              <p>{stepInfo[step]!.note}</p>
              <span>Let’s make room for the good stuff.</span>
            </MotionPanel>
          </aside>
          <MotionPanel
            changeKey={step}
            order={step}
            distance={6}
            duration={0.12}
            className="onboarding-card setup-form"
          >
            <div className="onboarding-top">
              <Doodle
                name={(["suitcase", "map", "wallet", "sun"] as const)[step]}
                colour={["#FFD69A", "#CBDDF0", "#CDE5D4", "#E8ACA0"][step]}
              />
              <span className="eyebrow">
                STEP {step + 1} OF 4 ·{" "}
                {me.data?.unlimitedOwner
                  ? "UNLIMITED ADMIN ACCESS"
                  : me.data?.entitlement?.freeTripClaimedAt
                    ? me.data?.pro
                      ? "INCLUDED WITH YOUR SUBSCRIPTION"
                      : me.data?.tripCredits
                        ? "USES ONE BONUS TRIP CREDIT"
                        : "SUBSCRIPTION REQUIRED FOR A NEW TRIP"
                    : "YOUR FIRST TRIP IS FREE"}
              </span>
              <SetupQuestion>{titles[step]}</SetupQuestion>
              <p>{descriptions[step]}</p>
            </div>
            <button
              type="button"
              className="setup-help-button"
              aria-expanded={showHelp}
              onClick={() => setShowHelp(!showHelp)}
            >
              <Question size={17} /> A hand with this step?
            </button>
            {showHelp && (
              <p className="setup-step-help" role="note">
                {stepInfo[step]!.help}
              </p>
            )}
            {error && <Notice error>{error}</Notice>}
            {step === 0 && (
              <>
                <Field label="Your name">
                  <input
                    placeholder={me.data?.user.name ?? "Alex"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="given-name"
                  />
                </Field>
                <Field
                  label="How many people are going?"
                  hint="Including you. You can add names and invite everyone later."
                >
                  <div className="travel-group-preview">
                    <AvatarStack
                      people={Array.from(
                        { length: Math.min(people, 4) },
                        (_, i) => ({
                          id: `traveller-${i}`,
                          name: i === 0 ? name || "You" : `Traveller ${i + 1}`,
                        }),
                      )}
                      total={people}
                    />
                    <span>
                      {people === 1
                        ? "Your own adventure"
                        : "Your travel group"}
                    </span>
                  </div>
                  <div className="people-counter">
                    <button
                      aria-label="One fewer traveller"
                      disabled={people === 1}
                      onClick={() => setPeople(people - 1)}
                    >
                      <Minus />
                    </button>
                    <strong>
                      <RollingValue>{people}</RollingValue>
                    </strong>
                    <button
                      aria-label="One more traveller"
                      disabled={people === 50}
                      onClick={() => setPeople(people + 1)}
                    >
                      <Plus />
                    </button>
                  </div>
                </Field>
              </>
            )}
            {step === 1 && (
              <>
                <Field label="Your destinations">
                  <LocationPicker
                    cities
                    onSelect={(place) => {
                      if (!places.some((p) => p.id === place.id))
                        setPlaces([...places, place]);
                    }}
                  />
                </Field>
                <div className="destination-chips">
                  {places.map((place) => (
                    <span
                      key={place.id}
                      className={`kind-${place.kind ?? "city"}`}
                    >
                      <PlaceIcon place={place} size={22} />
                      <span className="chip-text">
                        <strong>{place.name}</strong>
                        <small>
                          {placeKindLabel(place)}
                          {placeSubtitle(place)
                            ? ` · ${placeSubtitle(place)}`
                            : ""}
                        </small>
                      </span>
                      <button
                        aria-label={`Remove ${place.name}`}
                        onClick={() =>
                          setPlaces(places.filter((p) => p.id !== place.id))
                        }
                      >
                        <X size={15} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="form-grid">
                  <Field label="Heading out">
                    <input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </Field>
                  <Field label="Coming back">
                    <input
                      type="date"
                      min={start}
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Starting from (optional)">
                  <input
                    placeholder="Your home city"
                    value={departure}
                    onChange={(e) => setDeparture(e.target.value)}
                  />
                </Field>
                <Notice>
                  <LockKey size={17} /> Destinations become fixed when you
                  create your trip. Include all the cities you want to visit.
                  Day trips within 100 km are welcome.
                </Notice>
              </>
            )}
            {step === 2 && (
              <>
                <div className="form-grid">
                  <Field label="Estimated budget (optional)">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="1,200"
                      value={budget}
                      onChange={(e) => setBudget(e.target.value)}
                    />
                  </Field>
                  <Field label="Budget currency">
                    <Select
                      value={currency}
                      onValueChange={(nextValue) => setCurrency(nextValue)}
                    >
                      {[
                        "EUR",
                        "GBP",
                        "USD",
                        "RON",
                        "CHF",
                        "JPY",
                        "AUD",
                        "CAD",
                        "SGD",
                        "THB",
                        "NZD",
                        "CNY",
                        "INR",
                        "KRW",
                        "MXN",
                        "BRL",
                        "PLN",
                        "NOK",
                        "SEK",
                        "DKK",
                      ].map((c) => (
                        <SelectOption key={c}>{c}</SelectOption>
                      ))}
                    </Select>
                  </Field>
                </div>
                {destinationCurrency && currency !== destinationCurrency && (
                  <button
                    type="button"
                    className="plain-link"
                    onClick={() => setCurrency(destinationCurrency)}
                  >
                    Use {destinationCurrency} for {places[0]?.country}
                  </button>
                )}
                <div className="choice-row">
                  <MotionGroup>
                    <MotionChoice
                      active={!perPerson}
                      className={!perPerson ? "selected" : ""}
                      onClick={() => setPerPerson(false)}
                    >
                      For the whole group
                    </MotionChoice>
                    <MotionChoice
                      active={perPerson}
                      className={perPerson ? "selected" : ""}
                      onClick={() => setPerPerson(true)}
                    >
                      For each person
                    </MotionChoice>
                  </MotionGroup>
                </div>
                <p className="fine-print">
                  You can add expenses in other currencies. Your main budget
                  currency stays the same for this trip.
                </p>
                <div className="soft-tip">
                  <Doodle name="wallet" colour="#CDE5D4" />
                  <p>
                    Don’t have a number yet?
                    <br />
                    <strong>
                      Leave it blank. Let your plan help you find it.
                    </strong>
                  </p>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="module-choices">
                  <MotionGroup>
                    {[
                      [
                        "both",
                        "The whole lovely picture",
                        "Itinerary + budget, working together",
                        "map",
                      ],
                      [
                        "itinerary",
                        "Just the adventure",
                        "Plan your days, places and routes",
                        "suitcase",
                      ],
                      [
                        "budget",
                        "Just the numbers",
                        "Give every expense a home",
                        "wallet",
                      ],
                    ].map(([value, title, description, icon]) => (
                      <MotionChoice
                        key={value}
                        active={modules === value}
                        className={modules === value ? "selected" : ""}
                        onClick={() => setModules(value as typeof modules)}
                      >
                        <Doodle name={icon as any} />
                        <span className="module-label">
                          <strong>{title}</strong>
                          <small>{description}</small>
                        </span>
                        <span className="choice-check">
                          {modules === value && <Check size={17} />}
                        </span>
                      </MotionChoice>
                    ))}
                  </MotionGroup>
                </div>
                <div className="trip-confirmation">
                  <strong>{places.map((p) => p.name).join(" → ")}</strong>
                  <p>
                    {start} — {end} · {people} travellers
                  </p>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />{" "}
                    I’m happy with these destinations. They will be fixed after
                    I create this trip.
                  </label>
                  <small>
                    Dates can change until departure. Once the trip starts, its
                    period becomes fixed too. Includes 10 successful menu
                    imports.
                  </small>
                </div>
              </>
            )}
            <div className="onboarding-actions">
              <Button
                variant="ghost"
                onClick={() => (step ? setStep(step - 1) : navigate("/app"))}
              >
                <ArrowLeft size={18} /> Back
              </Button>
              {step < 3 ? (
                <Button onClick={next}>
                  Continue <ArrowRight size={18} />
                </Button>
              ) : (
                <Button onClick={create} loading={busy} disabled={!confirmed}>
                  Create my trip <ArrowRight size={18} />
                </Button>
              )}
            </div>
          </MotionPanel>
        </div>
        <p className="setup-reassurance">
          <LockKey size={14} />{" "}
          {draftSaved
            ? "Your draft stays on this device. Pick up where you left off."
            : "Device storage is unavailable. Keep this page open until your trip is created."}
        </p>
      </main>
    </div>
  );
}
