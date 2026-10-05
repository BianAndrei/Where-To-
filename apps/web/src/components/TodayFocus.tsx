import {
  flightProgress,
  type todayPlan,
  type TripState,
  type TripItem,
} from "@whereto/shared";
import {
  ArrowUpRight,
  NavigationArrow,
  Plus,
  Files,
} from "@phosphor-icons/react";
import { Button } from "./ui";
import FlightTimeline from "./FlightTimeline";
export default function TodayFocus({
  state,
  plan,
  onEdit,
  onExpense,
  onDocuments,
  onPlan,
  readOnly,
}: {
  state: TripState;
  plan: ReturnType<typeof todayPlan>;
  onEdit: (item: TripItem) => void;
  onExpense: () => void;
  onDocuments: () => void;
  onPlan: () => void;
  readOnly: boolean;
}) {
  const next = plan.focus;
  const flight = next?.flight ? flightProgress(next.flight) : null;
  const navigation = flight?.airport ?? next?.location;
  return (
    <div className="today-focus">
      <span className="eyebrow">
        {plan.phase === "before"
          ? "YOUR ADVENTURE IS COMING"
          : plan.phase === "after"
            ? "GOOD MEMORIES, ALL TOGETHER"
            : plan.focusKind === "ongoing"
              ? "HAPPENING NOW"
              : plan.focusKind === "flexible"
                ? "WHENEVER YOU FEEL LIKE IT"
                : "YOUR NEXT STOP"}
      </span>
      <h3>
        {next?.title ??
          (plan.phase === "before"
            ? `Your trip starts ${state.startDate}.`
            : plan.phase === "after"
              ? "Your trip is wrapped up."
              : "Time to explore.")}
      </h3>
      <p>
        {next
          ? `${next.time ?? "No set time"} · ${next.location?.name ?? "Location to be added"} · ${plan.timezone}`
          : plan.phase === "during"
            ? "No upcoming timed stops. Your full plan is just below."
            : "Your plans, bookings and expenses are still here whenever you need them."}
      </p>
      {next?.flight && <FlightTimeline flight={next.flight} />}
      {flight && (
        <p className="flight-notice">
          Based on your saved schedule:{" "}
          {flight.phase === "connection"
            ? `connection at ${flight.airport?.code}, next departure ${flight.segment.departure.localTime?.slice(11)} local time`
            : flight.phase === "in-flight"
              ? `flying to ${flight.airport?.code}`
              : `departure from ${flight.segment.departure.airport?.code}`}
          . Check the airline for live changes.
        </p>
      )}
      <div className="today-actions">
        {navigation && (
          <a
            className="button button-primary"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/maps/dir/?api=1&destination=${navigation.lat},${navigation.lon}`}
          >
            <NavigationArrow size={18} />
            Navigate
          </a>
        )}
        {next?.bookingUrl && (
          <a
            className="button button-secondary"
            href={next.bookingUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open booking <ArrowUpRight size={18} />
          </a>
        )}
        {next && (
          <Button variant="secondary" onClick={() => onEdit(next)}>
            View stop
          </Button>
        )}
        {!next && plan.phase !== "during" && (
          <Button variant="secondary" onClick={onPlan}>
            Open {plan.phase === "before" ? "your first day" : "the itinerary"}
          </Button>
        )}
        {!readOnly && (
          <Button variant="secondary" onClick={onExpense}>
            <Plus size={18} />
            Add a quick expense
          </Button>
        )}
      </div>
      <div className="today-essentials">
        {plan.stay && (
          <button className="plain-link" onClick={() => onEdit(plan.stay!)}>
            Your stay: {plan.stay.title} →
          </button>
        )}
        <button className="plain-link" onClick={onDocuments}>
          <Files size={17} />
          Booking documents
        </button>
      </div>
    </div>
  );
}
