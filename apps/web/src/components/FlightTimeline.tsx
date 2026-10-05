import {
  flightConnections,
  flightMinutes,
  flightRoute,
  durationLabel,
  type Flight,
} from "@whereto/shared";
import { AirplaneTilt, MapPin } from "@phosphor-icons/react";
import "./flights.css";
export default function FlightTimeline({
  flight,
  compact = false,
}: {
  flight: Flight;
  compact?: boolean;
}) {
  const connections = flightConnections(flight);
  const first = flight.segments[0]!,
    last = flight.segments.at(-1)!;
  return (
    <section
      className={`flight-timeline ${compact ? "compact" : ""}`}
      aria-label="Flight itinerary"
    >
      <div className="flight-route-heading">
        <AirplaneTilt size={22} />
        <strong>{flightRoute(flight)}</strong>
        <span>
          {connections.length
            ? `${connections.length} ${connections.length === 1 ? "connection" : "connections"}`
            : "Nonstop"}{" "}
          · {durationLabel(flightMinutes(first.departure, last.arrival))}
        </span>
      </div>
      <ol>
        {flight.segments.map((s, i) => (
          <li key={s.id}>
            {i > 0 && (
              <div className="flight-layover">
                <MapPin size={16} />
                <span>
                  <strong>
                    {connections[i - 1]!.airportChange
                      ? `Change airports: ${connections[i - 1]!.airport?.code} → ${connections[i - 1]!.nextAirport?.code}`
                      : `Layover in ${s.departure.airport?.city || s.departure.airport?.code}`}
                  </strong>{" "}
                  · {durationLabel(connections[i - 1]!.minutes)}
                  {(connections[i - 1]!.selfTransfer ||
                    connections[i - 1]!.airportChange) && (
                    <small>
                      Self-transfer: allow for travel, baggage and a new
                      check-in.
                    </small>
                  )}
                  {connections[i - 1]!.minutes != null &&
                    connections[i - 1]!.minutes! < 90 && (
                      <small>
                        Short connection — confirm minimum connection time with
                        your airline.
                      </small>
                    )}
                </span>
              </div>
            )}
            <div className="flight-segment-label">
              {s.airline} {s.number || `Segment ${i + 1}`}{" "}
              <span>
                {durationLabel(flightMinutes(s.departure, s.arrival))}
              </span>
            </div>
            <div className="flight-airports">
              {(["departure", "arrival"] as const).map((key) => (
                <div className="flight-airport" key={key}>
                  <small>{key === "departure" ? "DEPARTURE" : "ARRIVAL"}</small>
                  <strong>
                    {s[key].localTime?.slice(11) ?? "—"}{" "}
                    <b>{s[key].airport?.code ?? "Choose airport"}</b>
                  </strong>
                  <span>
                    {s[key].airport?.name ?? "Airport to be confirmed"}
                  </span>
                  <small>
                    {s[key].localTime?.slice(0, 10) ?? "Date to be confirmed"} ·{" "}
                    {s[key].airport?.timezone ?? "Time zone unknown"}
                  </small>
                  {(s[key].terminal || s[key].gate) && (
                    <small>
                      {s[key].terminal && `Terminal ${s[key].terminal}`}{" "}
                      {s[key].gate && `· Gate ${s[key].gate}`}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
      {!compact && (
        <p className="flight-notice">
          All times are local to each airport. Confirm schedule and gate changes
          with the airline.
        </p>
      )}
    </section>
  );
}
