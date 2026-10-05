import { useState } from "react";
import Decimal from "decimal.js";
import { toast } from "sonner";
import {
  flightTimeOptions,
  transferNeeds,
  newItem,
  makeId,
  type TransferNeed,
  type TripState,
  type TripItem,
} from "@whereto/shared";
import { post } from "../lib/api";
import { Modal, Field, Button, Notice } from "./ui";
import { Select, SelectOption } from "./Select";
import { Train } from "@phosphor-icons/react";
type Mode = "train" | "bus" | "taxi";
type Quote = {
  mode: Mode;
  price: string;
  minutes: string;
  changes: string;
  basis: "person" | "group";
};
type ProviderOption = {
  mode: Mode;
  available: boolean;
  minutes?: number;
  changes?: number;
  source?: string;
  message?: string;
  legs?: { from: string; to: string; line: string }[];
  fare?: { currencyCode?: string; units?: string; nanos?: number };
};
export default function TransferPlanner({
  state,
  tripId,
  initial,
  onClose,
  onSave,
  demo,
}: {
  state: TripState;
  tripId: string;
  initial?: TransferNeed;
  onClose: () => void;
  onSave: (i: TripItem) => Promise<void>;
  demo: boolean;
}) {
  const needs = transferNeeds(state);
  const [needId, setNeedId] = useState(initial?.id ?? needs[0]?.id ?? "");
  const need = needs.find((n) => n.id === needId);
  const [depart, setDepart] = useState("");
  const [offset, setOffset] = useState("");
  const [mode, setMode] = useState<Mode>("train");
  const [quotes, setQuotes] = useState<Quote[]>(
    ["train", "bus", "taxi"].map((mode) => ({
      mode: mode as Mode,
      basis: "group" as const,
      price: "",
      minutes: "",
      changes: "",
    })),
  );
  const [provider, setProvider] = useState<{
    options: ProviderOption[];
    checkedAt: string;
  }>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [url, setUrl] = useState("");
  const times =
    need && depart ? flightTimeOptions(depart, need.from.timezone) : [];
  const instant =
    times.length === 1 ? times[0] : times.find((t) => t.offset === offset);
  const selected = quotes.find((q) => q.mode === mode)!;
  function patchQuote(mode: Mode, patch: Partial<Quote>) {
    setQuotes(quotes.map((q) => (q.mode === mode ? { ...q, ...patch } : q)));
    setConfirmed(false);
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Connect your stops."
      description="Compare your airport-to-stay options, then add one transfer to the plan."
      wide
    >
      <div className="planning-stack">
        {!needs.length ? (
          <Notice>
            Add a flight with airport details and a dated stay with a location
            to see transfers that still need planning. Existing linked transfers
            stay in your itinerary.
          </Notice>
        ) : (
          <>
            <Field label="Journey">
              <Select
                value={needId}
                onValueChange={(v) => {
                  setNeedId(v);
                  setProvider(undefined);
                  setDepart("");
                  setConfirmed(false);
                  setQuotes(
                    quotes.map((q) => ({
                      ...q,
                      price: "",
                      minutes: "",
                      changes: "",
                    })),
                  );
                }}
              >
                {needs.map((n) => (
                  <SelectOption key={n.id} value={n.id}>
                    {n.day} · {n.from.name} → {n.to.name}
                  </SelectOption>
                ))}
              </Select>
            </Field>
            <div className="planning-intro">
              <Train
                className="transfer-mode-icon"
                size={36}
                aria-hidden="true"
              />
              <div>
                <strong>
                  {need?.from.name} → {need?.to.name}
                </strong>
                <p>
                  {need?.direction === "arrival"
                    ? `Flight arrives ${need.time ?? "at an unconfirmed time"}. Allow time for immigration and bags.`
                    : "Allow enough time for check-in and airport security."}
                </p>
              </div>
            </div>
            <Field
              label={`Leave at · ${need?.from.timezone}`}
              hint="Choose the actual transfer departure time, including time to collect bags."
            >
              <input
                type="datetime-local"
                min={state.startDate + "T00:00"}
                max={state.endDate + "T23:59"}
                value={depart}
                onChange={(e) => {
                  setDepart(e.target.value);
                  setProvider(undefined);
                  setConfirmed(false);
                }}
              />
            </Field>
            {times.length > 1 && (
              <Field label="Repeated local time · UTC offset">
                <Select value={offset} onValueChange={setOffset}>
                  <SelectOption value="">Confirm offset</SelectOption>
                  {times.map((t) => (
                    <SelectOption key={t.offset} value={t.offset}>
                      UTC{t.offset}
                    </SelectOption>
                  ))}
                </Select>
              </Field>
            )}
            {depart && !times.length && (
              <Notice error>
                This local time does not exist. Check the clock change and
                choose another time.
              </Notice>
            )}
            <Button
              variant="secondary"
              loading={busy}
              disabled={!instant || demo}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setProvider(
                    await post(`/trips/${tripId}/planning/transfers`, {
                      needId,
                      departure: new Date(instant!.instant).toISOString(),
                    }),
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Compare available routes
            </Button>
            <p className="muted">
              {demo
                ? "Route lookup is available in your own trip when transport services are connected. Try comparing your own estimates here."
                : "Route lookup depends on connected services and coverage. You can always compare details from your operator."}{" "}
              Prices below use {state.currency}.
            </p>
            {provider && (
              <div className="transfer-provider">
                <span className="eyebrow">
                  ROUTE INFORMATION ·{" "}
                  {new Date(provider.checkedAt).toLocaleTimeString()}
                </span>
                {provider.options.map((o) => (
                  <div key={o.mode}>
                    <b>{o.mode === "taxi" ? "Car / taxi" : o.mode}</b>
                    {o.available ? (
                      <>
                        <p>
                          {o.minutes} min door to door · {o.changes} changes ·{" "}
                          {o.source}
                        </p>
                        {o.legs?.map((l, i) => (
                          <small key={i}>
                            {l.line}: {l.from} → {l.to}
                          </small>
                        ))}
                        {o.fare && (
                          <p>
                            Provider fare: {o.fare.units ?? "0"}
                            {o.fare.nanos
                              ? ` + ${o.fare.nanos / 1000000000}`
                              : ""}{" "}
                            {o.fare.currencyCode}. Confirm passenger coverage
                            with the operator.
                          </p>
                        )}
                        <small>
                          Walking or waiting may be included in the total. Taxi
                          pickup wait is not included.
                        </small>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            patchQuote(o.mode, {
                              minutes:
                                o.minutes == null ? "" : String(o.minutes),
                              changes:
                                o.changes == null ? "" : String(o.changes),
                            })
                          }
                        >
                          Use these times
                        </Button>
                      </>
                    ) : (
                      <p>{o.message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="transfer-comparison">
              {quotes.map((q) => (
                <article
                  className={mode === q.mode ? "selected" : ""}
                  key={q.mode}
                >
                  <label className="checkbox-label">
                    <input
                      type="radio"
                      name="transfer-mode"
                      checked={mode === q.mode}
                      onChange={() => {
                        setMode(q.mode);
                        setConfirmed(false);
                      }}
                    />
                    <b>
                      {q.mode === "taxi"
                        ? "Taxi"
                        : q.mode === "train"
                          ? "Train / metro"
                          : "Bus"}
                    </b>
                  </label>
                  <Field label={`Price (${state.currency})`}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={q.price}
                      placeholder="Unknown"
                      onChange={(e) =>
                        patchQuote(q.mode, { price: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="This price is">
                    <Select
                      value={q.basis}
                      onValueChange={(v) =>
                        patchQuote(q.mode, { basis: v as "person" | "group" })
                      }
                    >
                      <SelectOption value="group">For the group</SelectOption>
                      <SelectOption value="person">Per person</SelectOption>
                    </Select>
                  </Field>
                  <Field label="Total minutes">
                    <input
                      type="number"
                      min="1"
                      max="14400"
                      value={q.minutes}
                      placeholder="Unknown"
                      onChange={(e) =>
                        patchQuote(q.mode, { minutes: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Changes">
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={q.changes}
                      placeholder="Unknown"
                      onChange={(e) =>
                        patchQuote(q.mode, { changes: e.target.value })
                      }
                    />
                  </Field>
                  <small>
                    {q.price
                      ? `${new Decimal(q.price).times(q.basis === "person" ? state.participants.length : 1).toFixed(2)} ${state.currency} for ${state.participants.length} travellers`
                      : "Group total not estimated"}
                  </small>
                </article>
              ))}
            </div>
            <Field label="Operator / booking link (optional)">
              <input
                type="url"
                maxLength={2000}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I checked the selected option, passenger coverage and luggage. Add
              it as a planned transfer.
            </label>
            <Button
              loading={busy}
              disabled={!confirmed || !instant || !need}
              onClick={async () => {
                if (!need) return;
                setBusy(true);
                setError("");
                try {
                  const item = newItem(state, depart.slice(0, 10));
                  item.kind = "transport";
                  item.category = "Transport";
                  item.title =
                    `${mode === "taxi" ? "Taxi" : mode === "bus" ? "Bus" : "Train"} · ${need.from.name} to ${need.to.name}`.slice(
                      0,
                      200,
                    );
                  item.time = depart.slice(11);
                  item.duration = selected.minutes
                    ? Number(selected.minutes)
                    : 0;
                  item.location = need.from;
                  item.endLocation = need.to;
                  item.bookingUrl = url;
                  item.transfer = {
                    departureOffset: instant!.offset,
                    flightId: need.flight.id,
                    stayId: need.stay.id,
                    direction: need.direction,
                    mode,
                    changes: selected.changes ? Number(selected.changes) : null,
                    costSource: "manual",
                  };
                  item.notes = `Airport transfer · ${selected.changes || "Unconfirmed"} changes. ${selected.minutes ? "Duration confirmed by traveller." : "Duration still to be confirmed."}`;
                  if (selected.price)
                    item.lines = [
                      {
                        id: makeId(),
                        label: "Transfer estimate",
                        price: selected.price,
                        unit: selected.basis === "person" ? "person" : "group",
                        quantity:
                          selected.basis === "person"
                            ? String(state.participants.length)
                            : "1",
                        multiplier: "1",
                        currency: state.currency,
                        rate: "1",
                        rateDate: new Date().toISOString().slice(0, 10),
                        status: "estimated",
                      },
                    ];
                  await onSave(item);
                  toast.success("Transfer added to your day, map and budget.");
                  onClose();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Add selected transfer
            </Button>
          </>
        )}
        {error && <Notice error>{error}</Notice>}
      </div>
    </Modal>
  );
}
