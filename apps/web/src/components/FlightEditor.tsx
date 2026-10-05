import { Disclosure } from "./motion";
import { publicAsset } from "../lib/deployment";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Trash,
  AirplaneTilt,
  ArrowDown,
  ArrowUp,
} from "@phosphor-icons/react";
import {
  airportSchema,
  flightSchema,
  flightTimeOptions,
  newFlightSegment,
  parseFlightText,
  searchAirports,
  type Airport,
  type Flight,
  type FlightSegment,
} from "@whereto/shared";
import { Field, Button, Notice } from "./ui";
import { Select, SelectOption } from "./Select";
import { LiquidToggle } from "./PlayfulControls";
import FlightTimeline from "./FlightTimeline";
import "./flights.css";
const EXAMPLE =
  "LH1423\nDeparture: OTP 2026-10-12 06:00\nArrival: FRA 2026-10-12 07:40\n\nLH1172\nDeparture: FRA 2026-10-12 09:10\nArrival: LIS 2026-10-12 11:25";
function AirportPicker({
  value,
  onChange,
  airports,
  label,
}: {
  value: Airport | null;
  onChange: (a: Airport | null) => void;
  airports: Airport[];
  label: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const results = searchAirports(airports, query);
  const select = (a: Airport) => {
    onChange(a);
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="airport-picker">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open && !!results.length}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={
          open && results[active] ? `${id}-${active}` : undefined
        }
        autoComplete="off"
        value={open ? query : value ? `${value.code} · ${value.name}` : query}
        placeholder="Airport code, city or name"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            setActive((n) =>
              Math.max(
                0,
                Math.min(
                  results.length - 1,
                  n + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
          if (e.key === "Enter" && open) {
            e.preventDefault();
            if (results[active]) select(results[active]!);
          }
        }}
      />
      {open && results.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="airport-results">
          {results.map((a, i) => (
            <li
              role="option"
              aria-selected={active === i}
              id={`${id}-${i}`}
              key={a.code}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(a)}
            >
              <strong>{a.code}</strong>
              <span>
                {a.name}
                <small>
                  {a.city} · {a.country}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && query.length >= 2 && !results.length && (
        <small>
          No matching airport in the local directory. Try its three-letter code.
        </small>
      )}
      {value && (
        <small>
          {value.city} · {value.timezone}
        </small>
      )}
    </div>
  );
}
export default function FlightEditor({
  flight,
  onChange,
  readOnly = false,
}: {
  flight: Flight;
  onChange: (f: Flight) => void;
  readOnly?: boolean;
}) {
  const [text, setText] = useState("");
  const [review, setReview] = useState<ReturnType<
    typeof parseFlightText
  > | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [source, setSource] = useState<"text" | "pdf">("text");
  const airports = useQuery({
    queryKey: ["airport-directory"],
    queryFn: async () => {
      const r = await fetch(publicAsset("data/airports.json"));
      if (!r.ok)
        throw new Error("Airport directory unavailable. Retry when connected.");
      const data = await r.json();
      return airportSchema.array().parse(data.airports);
    },
    staleTime: Infinity,
  });
  const patch = (id: string, p: Partial<FlightSegment>) =>
    onChange({
      ...flight,
      segments: flight.segments.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });
  function move(i: number, delta: number) {
    const segments = [...flight.segments];
    [segments[i], segments[i + delta]] = [segments[i + delta]!, segments[i]!];
    onChange({ ...flight, segments });
  }
  async function read(file: File) {
    setReading(true);
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a PDF or text file smaller than 5 MB.");
      let content = "";
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        GlobalWorkerOptions.workerSrc = worker.default;
        const loading = getDocument({
          data: await file.arrayBuffer(),
        });
        try {
          const pdf = await loading.promise;
          if (pdf.numPages > 10)
            throw new Error("Choose a booking PDF with at most 10 pages.");
          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const data = await page.getTextContent();
            content +=
              data.items
                .map((x: any) =>
                  "str" in x ? x.str + (x.hasEOL ? "\n" : " ") : "",
                )
                .join("") + "\n";
          }
        } finally {
          await loading.destroy();
        }
        setSource("pdf");
      } else if (/\.(txt|eml)$/i.test(file.name)) {
        content = await file.text();
        setSource("text");
      } else throw new Error("Use a text-based PDF, .txt or .eml file.");
      if (!content.trim())
        throw new Error(
          "This PDF has no readable text. Paste the booking text or add the segments below.",
        );
      setText(content.slice(0, 50000));
      setReview(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  return (
    <div className="flight-editor">
      <div className="flight-editor-intro">
        <AirplaneTilt size={28} />
        <div>
          <h3>From take-off to touch-down.</h3>
          <p>
            One booking, every airport. Add connecting flights below; keep the
            total fare in Costs.
          </p>
        </div>
      </div>
      {!readOnly && (
        <Disclosure className="flight-import">
          <summary>Import from booking text or a PDF</summary>
          <p>
            Read locally on your device. Review the result before replacing this
            route. Your booking is not sent to AI.
          </p>
          <Field label="Booking text">
            <textarea
              rows={6}
              maxLength={50000}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setSource("text");
                setReview(null);
              }}
              placeholder={EXAMPLE}
            />
          </Field>
          <div className="flight-import-actions">
            <label className="button button-secondary">
              {reading ? "Reading file…" : "Read booking file"}
              <input
                type="file"
                accept=".pdf,.txt,.eml"
                disabled={reading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void read(file);
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              type="button"
              disabled={!text.trim() || !airports.data || reading}
              onClick={() => setReview(parseFlightText(text, airports.data!))}
            >
              Preview import
            </Button>
          </div>
          <Disclosure>
            <summary>Show supported text example</summary>
            <pre>{EXAMPLE}</pre>
            <small>
              Example only. Flight schedules are illustrative. Separate each
              flight into its own block.
            </small>
          </Disclosure>
          {review && (
            <div className="flight-import-review">
              <FlightTimeline flight={review.flight} />
              {review.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onChange({ ...review.flight, source });
                  setReview(null);
                  setText("");
                }}
              >
                Use these segments
              </Button>
            </div>
          )}
        </Disclosure>
      )}
      {error && <Notice error>{error}</Notice>}
      {airports.isError && (
        <Notice error>
          {airports.error.message}{" "}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void airports.refetch()}
          >
            Retry directory
          </Button>
        </Notice>
      )}
      {flight.segments.map((segment, i) => (
        <section
          className="flight-segment-editor"
          key={segment.id}
          aria-label={`Flight segment ${i + 1}`}
        >
          <header>
            <strong>FLIGHT {String(i + 1).padStart(2, "0")}</strong>
            <div>
              <button
                type="button"
                className="icon-button"
                disabled={!i || readOnly}
                aria-label={`Move segment ${i + 1} earlier`}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={i === flight.segments.length - 1 || readOnly}
                aria-label={`Move segment ${i + 1} later`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={17} />
              </button>
              <button
                type="button"
                className="icon-button"
                disabled={flight.segments.length === 1 || readOnly}
                aria-label={`Remove segment ${i + 1}`}
                onClick={() =>
                  onChange({
                    ...flight,
                    segments: flight.segments.filter(
                      (s) => s.id !== segment.id,
                    ),
                  })
                }
              >
                <Trash size={17} />
              </button>
            </div>
          </header>
          <div className="form-grid">
            <Field label="Airline">
              <input
                value={segment.airline}
                placeholder="e.g. Lufthansa"
                maxLength={120}
                onChange={(e) => patch(segment.id, { airline: e.target.value })}
              />
            </Field>
            <Field label="Flight number">
              <input
                value={segment.number}
                placeholder="e.g. LH1423"
                maxLength={20}
                onChange={(e) =>
                  patch(segment.id, { number: e.target.value.toUpperCase() })
                }
              />
            </Field>
          </div>
          <div className="flight-endpoints">
            {(["departure", "arrival"] as const).map((key) => {
              const stop = segment[key];
              const options =
                stop.airport && stop.localTime
                  ? flightTimeOptions(stop.localTime, stop.airport.timezone)
                  : [];
              return (
                <div key={key}>
                  <AirportPicker
                    label={
                      key === "departure"
                        ? "Departure airport"
                        : "Arrival airport"
                    }
                    airports={airports.data ?? []}
                    value={stop.airport}
                    onChange={(airport) =>
                      patch(segment.id, {
                        [key]: { ...stop, airport, offset: null },
                      })
                    }
                  />
                  <Field
                    label={
                      key === "departure"
                        ? "Departs · local date & time"
                        : "Arrives · local date & time"
                    }
                  >
                    <input
                      type="datetime-local"
                      value={stop.localTime ?? ""}
                      onChange={(e) =>
                        patch(segment.id, {
                          [key]: {
                            ...stop,
                            localTime: e.target.value || null,
                            offset: null,
                          },
                        })
                      }
                    />
                  </Field>
                  {options.length > 1 && (
                    <Field label="Clock change — choose UTC offset">
                      <Select
                        value={stop.offset ?? ""}
                        onValueChange={(offset) =>
                          patch(segment.id, {
                            [key]: { ...stop, offset: offset || null },
                          })
                        }
                      >
                        <SelectOption value="">
                          Confirm the booking offset
                        </SelectOption>
                        {options.map((o) => (
                          <SelectOption key={o.offset} value={o.offset}>
                            UTC{o.offset}
                          </SelectOption>
                        ))}
                      </Select>
                    </Field>
                  )}
                  <div className="form-grid">
                    <Field label="Terminal">
                      <input
                        value={stop.terminal}
                        maxLength={40}
                        placeholder="Optional"
                        onChange={(e) =>
                          patch(segment.id, {
                            [key]: { ...stop, terminal: e.target.value },
                          })
                        }
                      />
                    </Field>
                    <Field label="Gate">
                      <input
                        value={stop.gate}
                        maxLength={40}
                        placeholder="Optional"
                        onChange={(e) =>
                          patch(segment.id, {
                            [key]: { ...stop, gate: e.target.value },
                          })
                        }
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
          {i > 0 && (
            <LiquidToggle
              checked={segment.selfTransfer}
              onChange={(e) =>
                patch(segment.id, { selfTransfer: e.target.checked })
              }
            >
              Separate tickets / collect bags and check in again
            </LiquidToggle>
          )}
        </section>
      ))}
      {!readOnly && (
        <Button
          type="button"
          variant="secondary"
          disabled={flight.segments.length >= 12}
          onClick={() =>
            onChange({
              ...flight,
              segments: [
                ...flight.segments,
                newFlightSegment("", flight.segments.at(-1)!.arrival.airport),
              ],
            })
          }
        >
          <Plus size={18} /> Add connecting flight
        </Button>
      )}
      <Field label="Booking reference (private)">
        <input
          maxLength={80}
          value={flight.bookingReference}
          onChange={(e) =>
            onChange({ ...flight, bookingReference: e.target.value })
          }
          placeholder="Optional · hidden from public links"
        />
      </Field>
      <FlightTimeline flight={flight} />
      {!flightSchema.safeParse(flight).success && (
        <p className="flight-notice">
          Complete the airports and check the dates before saving. Unknown times
          stay unknown.
        </p>
      )}
      <p className="fine-print">
        Airport directory:{" "}
        <a
          href="https://github.com/mwgg/Airports"
          target="_blank"
          rel="noreferrer"
        >
          mwgg/Airports
        </a>{" "}
        · bundled 8 Sep 2026. Schedules are entered or imported from your
        booking.
      </p>
    </div>
  );
}
