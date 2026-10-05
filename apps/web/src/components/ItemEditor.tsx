import { Select, SelectOption } from "./Select";
import Decimal from "decimal.js";
import TravellerPicker from "./TravellerPicker";
import { LiquidToggle, TravellerAvatar } from "./PlayfulControls";
import { useState, lazy, Suspense, type ReactNode } from "react";
import {
  Plus,
  Trash,
  MapPin,
  ArrowUpRight,
  LockKey,
} from "@phosphor-icons/react";
import {
  itemSchema,
  makeId,
  itemTotal,
  itemPaid,
  money,
  CATEGORIES,
  newFlightSegment,
  flightRoute,
  syncFlightItem,
  type TripItem,
  type TripState,
  type CostLine,
} from "@whereto/shared";
import { toast } from "sonner";
import { Modal, Field, Button, Notice } from "./ui";
import { LocationPicker } from "./LocationPicker";
import { api } from "../lib/api";
import { MotionChoice, MotionGroup, MotionPanel } from "./motion";
const PinMap = lazy(() => import("./MapView"));
const FlightEditor = lazy(() => import("./FlightEditor"));
export default function ItemEditor({
  item,
  state,
  onClose,
  onSave,
  demo = false,
  readOnly = false,
  hideFinancial = false,
  intro,
  initialTab = "details",
}: {
  item: TripItem;
  state: TripState;
  onClose: () => void;
  onSave: (i: TripItem) => Promise<void>;
  demo?: boolean;
  readOnly?: boolean;
  hideFinancial?: boolean;
  intro?: ReactNode;
  initialTab?: "details" | "costs" | "payments";
}) {
  const [draft, setDraft] = useState<TripItem>(() => {
    const draft = structuredClone(item);
    if (draft.kind === "flight" && !draft.title && !draft.flight)
      draft.flight = {
        segments: [newFlightSegment()],
        bookingReference: "",
        source: "manual",
      };
    return draft;
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState<"details" | "costs" | "payments">(initialTab),
    [manual, setManual] = useState(false);
  const patch = (v: Partial<TripItem>) => setDraft((d) => ({ ...d, ...v }));
  const today = new Date().toISOString().slice(0, 10);
  function linePatch(id: string, patch: Partial<CostLine>) {
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }
  function addLine() {
    const nights =
      draft.kind === "accommodation" && draft.day && draft.endDay
        ? Math.max(
            1,
            Math.round(
              (Date.parse(draft.endDay) - Date.parse(draft.day)) / 86400000,
            ),
          )
        : 1;
    patch({
      lines: [
        ...draft.lines,
        {
          id: makeId(),
          label: draft.title || "Estimate",
          unit: draft.kind === "accommodation" ? "night" : "group",
          price: "0",
          quantity: String(nights),
          multiplier: "1",
          currency: state.currency,
          rate: "1",
          rateDate: today,
          status: "estimated",
        },
      ],
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const itemToSave =
        draft.kind === "accommodation"
          ? {
              ...draft,
              lines: draft.lines.map((line) => ({
                ...line,
                unit: "night" as const,
                quantity: new Decimal(line.quantity || "0")
                  .times(line.multiplier || "1")
                  .toString(),
                multiplier: "1",
              })),
            }
          : draft;
      await onSave(syncFlightItem(itemSchema.parse(itemToSave)));
      onClose();
    } catch (e) {
      setError(
        "issues" in (e as any)
          ? (e as any).issues.map((i: any) => i.message).join(" ")
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={item.title ? "Plan the details." : "Add to your adventure."}
      description="Your itinerary and budget stay in sync."
      wide
    >
      <form onSubmit={save} className={hideFinancial ? "hide-financial" : ""}>
        {intro}
        <div className="editor-tabs segmented">
          <MotionGroup>
            <MotionChoice
              type="button"
              active={tab === "details"}
              onClick={() => setTab("details")}
            >
              The plan
            </MotionChoice>
            <MotionChoice
              type="button"
              active={tab === "costs"}
              onClick={() => setTab("costs")}
            >
              Costs <small>{draft.lines.length}</small>
            </MotionChoice>
            <MotionChoice
              type="button"
              active={tab === "payments"}
              onClick={() => setTab("payments")}
            >
              Payments <small>{draft.payments.length}</small>
            </MotionChoice>
          </MotionGroup>
        </div>
        {error && <Notice error>{error}</Notice>}
        <fieldset disabled={readOnly} className="editor-fieldset">
          <MotionPanel
            changeKey={tab}
            order={["details", "costs", "payments"].indexOf(tab)}
            resize
          >
            {tab === "details" && (
              <>
                {draft.reservation && (
                  <Field label="Booking reference (private)">
                    <input
                      value={draft.reservation.reference}
                      maxLength={120}
                      onChange={(e) =>
                        patch({
                          reservation: {
                            ...draft.reservation!,
                            reference: e.target.value,
                          },
                        })
                      }
                    />
                  </Field>
                )}
                {draft.receipt && (
                  <Notice>
                    This meal uses a confirmed receipt and item-by-item split.
                    Use “Split a receipt” to replace it.{" "}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => patch({ receipt: undefined })}
                    >
                      Detach receipt calculation to edit costs manually
                    </Button>
                  </Notice>
                )}
                <Field label="What’s the plan?">
                  <input
                    autoFocus
                    required
                    value={draft.title}
                    onChange={(e) => patch({ title: e.target.value })}
                    placeholder="A museum, a café, a guided hike…"
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Type">
                    <Select
                      value={draft.kind}
                      onValueChange={(nextValue) => {
                        const kind = nextValue as TripItem["kind"];
                        patch({
                          kind,
                          flight:
                            kind === "flight"
                              ? (draft.flight ?? {
                                  segments: [newFlightSegment()],
                                  bookingReference: "",
                                  source: "manual",
                                })
                              : undefined,
                          category: {
                            restaurant: "Food & drinks",
                            accommodation: "Accommodation",
                            transport: "Transport",
                            flight: "Transport",
                            activity: "Activities",
                            shopping: "Shopping",
                            other: "Other",
                          }[kind],
                        });
                      }}
                    >
                      {[
                        "activity",
                        "restaurant",
                        "accommodation",
                        "transport",
                        "flight",
                        "shopping",
                        "other",
                      ].map((v) => (
                        <SelectOption key={v} value={v}>
                          {v[0]!.toUpperCase() + v.slice(1)}
                        </SelectOption>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Keep it as">
                    <Select
                      value={draft.state}
                      onValueChange={(nextValue) =>
                        patch({ state: nextValue as TripItem["state"] })
                      }
                    >
                      <SelectOption value="planned">
                        Included in the plan
                      </SelectOption>
                      <SelectOption value="idea">
                        Just an idea — not in the budget
                      </SelectOption>
                      <SelectOption value="booked">
                        Booked — payment tracked separately
                      </SelectOption>
                    </Select>
                  </Field>
                </div>
                {draft.kind === "flight" && draft.flight && (
                  <Suspense fallback={<p>Opening flight details…</p>}>
                    <FlightEditor
                      flight={draft.flight}
                      readOnly={readOnly}
                      onChange={(flight) =>
                        patch({
                          flight,
                          title:
                            !draft.title || draft.title.startsWith("Flight · ")
                              ? `Flight · ${flightRoute(flight)}`
                              : draft.title,
                        })
                      }
                    />
                  </Suspense>
                )}
                {draft.kind === "flight" && !draft.flight && !readOnly && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      patch({
                        flight: {
                          segments: [newFlightSegment()],
                          bookingReference: "",
                          source: "manual",
                        },
                      })
                    }
                  >
                    Add airports & connecting flights
                  </Button>
                )}
                {!draft.flight && (
                  <>
                    <div className="form-grid three">
                      <Field label="Day">
                        <input
                          type="date"
                          min={state.startDate}
                          max={state.endDate}
                          value={draft.day ?? ""}
                          onChange={(e) =>
                            patch({ day: e.target.value || null })
                          }
                        />
                      </Field>
                      <Field label="Time (optional)">
                        <input
                          type="time"
                          value={draft.time ?? ""}
                          onChange={(e) =>
                            patch({ time: e.target.value || null })
                          }
                        />
                      </Field>
                      <Field
                        label="Duration, minutes"
                        hint="Optional. Leave 0 if you don’t know yet; we won’t guess a travel or visit time."
                      >
                        <input
                          type="number"
                          min="0"
                          max="14400"
                          value={draft.duration}
                          onChange={(e) =>
                            patch({ duration: Number(e.target.value) })
                          }
                        />
                      </Field>
                    </div>
                    {["accommodation", "flight", "transport"].includes(
                      draft.kind,
                    ) && (
                      <Field
                        label={
                          draft.kind === "accommodation"
                            ? "Check-out day"
                            : "Arrival day"
                        }
                      >
                        <input
                          type="date"
                          value={draft.endDay ?? ""}
                          onChange={(e) =>
                            patch({ endDay: e.target.value || null })
                          }
                        />
                      </Field>
                    )}
                    <LiquidToggle
                      checked={draft.fixed}
                      onChange={(e) => patch({ fixed: e.target.checked })}
                    >
                      <LockKey size={16} /> Keep this booking in place when
                      suggesting a route
                    </LiquidToggle>
                    <Field label="Where?">
                      <LocationPicker
                        demo={demo}
                        bias={state.destinations[0]}
                        onSelect={(location) => patch({ location })}
                      />
                    </Field>
                    {["flight", "transport"].includes(draft.kind) && (
                      <Field label="Arriving at">
                        <LocationPicker
                          demo={demo}
                          onSelect={(endLocation) => patch({ endLocation })}
                        />
                        {draft.endLocation && (
                          <small>
                            {draft.endLocation.name} ·{" "}
                            {draft.endLocation.timezone}
                          </small>
                        )}
                      </Field>
                    )}
                    {draft.location && (
                      <div className="selected-place">
                        <MapPin size={20} />
                        <span>
                          <strong>{draft.location.name}</strong>
                          <small>{draft.location.timezone}</small>
                        </span>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Remove location"
                          onClick={() => patch({ location: null })}
                        >
                          <Trash size={17} />
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="plain-link"
                      onClick={() => setManual(!manual)}
                    >
                      {manual
                        ? "Hide manual location"
                        : "Add a location manually"}
                    </button>
                    {manual && (
                      <div className="manual-location">
                        <Field label="Place name">
                          <input
                            value={draft.location?.name ?? ""}
                            onChange={(e) =>
                              patch({
                                location: {
                                  id: `user:${draft.id}`,
                                  name: e.target.value,
                                  country: state.destinations[0]!.country,
                                  lat:
                                    draft.location?.lat ??
                                    state.destinations[0]!.lat,
                                  lon:
                                    draft.location?.lon ??
                                    state.destinations[0]!.lon,
                                  timezone: state.destinations[0]!.timezone,
                                  source: "user",
                                },
                              })
                            }
                          />
                        </Field>
                        <div className="form-grid">
                          <Field label="Latitude">
                            <input
                              type="number"
                              step="any"
                              value={draft.location?.lat ?? ""}
                              onChange={(e) =>
                                draft.location &&
                                patch({
                                  location: {
                                    ...draft.location,
                                    lat: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="Longitude">
                            <input
                              type="number"
                              step="any"
                              value={draft.location?.lon ?? ""}
                              onChange={(e) =>
                                draft.location &&
                                patch({
                                  location: {
                                    ...draft.location,
                                    lon: Number(e.target.value),
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>
                        <small>
                          The starting pin is the city centre. Enter the actual
                          coordinates or click the street map when connected.
                          Non-transport stops must stay within 100 km of a
                          confirmed destination.
                        </small>
                        {!readOnly && (
                          <Suspense fallback={<p>Opening the map…</p>}>
                            <PinMap
                              items={draft.location ? [draft] : []}
                              destinations={state.destinations}
                              demo={demo}
                              onPick={(point) =>
                                patch({
                                  location: {
                                    ...state.destinations[0]!,
                                    ...point,
                                    id: `user:${draft.id}`,
                                    name:
                                      draft.location?.name ||
                                      draft.title ||
                                      "Selected pin",
                                    source: "user",
                                    token: undefined,
                                  },
                                })
                              }
                            />
                          </Suspense>
                        )}
                      </div>
                    )}
                  </>
                )}
                <Field label="Booking or original website (optional)">
                  <input
                    type="url"
                    placeholder="https://…"
                    value={draft.bookingUrl}
                    onChange={(e) => patch({ bookingUrl: e.target.value })}
                  />
                </Field>
                <Field label="A note">
                  <textarea
                    rows={3}
                    placeholder="The table by the window. The entrance around the corner."
                    value={draft.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                  />
                </Field>
              </>
            )}
            {tab === "costs" && (
              <>
                <Field label="Budget category">
                  <Select
                    value={draft.category}
                    onValueChange={(nextValue) =>
                      patch({ category: nextValue })
                    }
                  >
                    {[
                      ...new Set([
                        ...CATEGORIES,
                        ...state.categories,
                        draft.category,
                      ]),
                    ].map((v) => (
                      <SelectOption key={v}>{v}</SelectOption>
                    ))}
                  </Select>
                </Field>
                <p className="muted">
                  Add a group estimate or separate prices for rooms, nights,
                  tickets and people.
                </p>
                {draft.lines.map((line) => (
                  <div className="cost-line-editor" key={line.id}>
                    <div className="cost-line-top">
                      <input
                        aria-label="Cost description"
                        value={line.label}
                        onChange={(e) =>
                          linePatch(line.id, { label: e.target.value })
                        }
                      />
                      <button
                        type="button"
                        aria-label="Remove cost line"
                        className="icon-button"
                        onClick={() =>
                          patch({
                            lines: draft.lines.filter((l) => l.id !== line.id),
                          })
                        }
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                    <div
                      className={`form-grid ${draft.kind === "accommodation" ? "" : "three"}`}
                    >
                      <Field label="Price">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          value={line.price}
                          onChange={(e) =>
                            linePatch(line.id, { price: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Currency">
                        <input
                          maxLength={3}
                          value={line.currency}
                          onChange={(e) =>
                            linePatch(line.id, {
                              currency: e.target.value.toUpperCase(),
                            })
                          }
                        />
                      </Field>
                      {draft.kind !== "accommodation" && (
                        <Field label="Price is per">
                          <Select
                            value={line.unit}
                            onValueChange={(nextValue) =>
                              linePatch(line.id, {
                                unit: nextValue as any,
                                quantity:
                                  nextValue === "person"
                                    ? String(state.participants.length)
                                    : line.quantity,
                              })
                            }
                          >
                            {[
                              "group",
                              "person",
                              "night",
                              "room",
                              "ticket",
                              "item",
                            ].map((v) => (
                              <SelectOption key={v}>{v}</SelectOption>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </div>
                    <div
                      className={`form-grid ${draft.kind === "accommodation" ? "" : "three"}`}
                    >
                      <Field
                        label={
                          draft.kind === "accommodation" ? "Nights" : "Quantity"
                        }
                        hint={
                          draft.kind === "accommodation"
                            ? "The check-in and check-out dates set the stay length."
                            : undefined
                        }
                      >
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            draft.kind === "accommodation"
                              ? new Decimal(line.quantity || "0")
                                  .times(line.multiplier || "1")
                                  .toString()
                              : line.quantity
                          }
                          onChange={(e) =>
                            linePatch(line.id, {
                              quantity: e.target.value,
                              ...(draft.kind === "accommodation"
                                ? { unit: "night", multiplier: "1" }
                                : {}),
                            })
                          }
                        />
                      </Field>
                      {draft.kind !== "accommodation" && (
                        <Field label="Multiplier (e.g. nights)">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={line.multiplier}
                            onChange={(e) =>
                              linePatch(line.id, { multiplier: e.target.value })
                            }
                          />
                        </Field>
                      )}
                      <Field label="Price status">
                        <Select
                          value={line.status}
                          onValueChange={(nextValue) =>
                            linePatch(line.id, { status: nextValue as any })
                          }
                        >
                          <SelectOption value="estimated">
                            Estimated
                          </SelectOption>
                          <SelectOption value="confirmed">
                            Confirmed
                          </SelectOption>
                        </Select>
                      </Field>
                    </div>
                    {line.currency !== state.currency && (
                      <div className="exchange-row">
                        <Field label={`1 ${line.currency} = ${state.currency}`}>
                          <input
                            type="number"
                            min="0.00000001"
                            step="any"
                            value={line.rate}
                            onChange={(e) =>
                              linePatch(line.id, { rate: e.target.value })
                            }
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={async () => {
                            if (demo) {
                              toast.info(
                                "Enter an exchange rate for the demo.",
                              );
                              return;
                            }
                            try {
                              const r = await api(
                                `/rates?base=${line.currency}&quote=${state.currency}`,
                              );
                              linePatch(line.id, {
                                rate: String(r.rate),
                                rateDate: r.date,
                              });
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          Get rate
                        </Button>
                        <small>Rate saved: {line.rateDate}</small>
                      </div>
                    )}
                  </div>
                ))}
                <Button type="button" variant="secondary" onClick={addLine}>
                  <Plus size={18} /> Add a cost line
                </Button>
                <div className="split-editor">
                  <h3>Who’s joining this one?</h3>
                  <p className="muted">
                    Choose the travellers sharing this cost. Adjust their shares
                    below if you want to split unequally.
                  </p>
                  <TravellerPicker
                    people={state.participants}
                    value={draft.participantIds}
                    onChange={(participantIds) => patch({ participantIds })}
                  />
                  {state.participants
                    .filter(
                      (p) =>
                        !draft.participantIds.length ||
                        draft.participantIds.includes(p.id),
                    )
                    .map((p) => (
                      <div className="participant-share" key={p.id}>
                        <span className="share-weight-name">
                          <TravellerAvatar person={p} />
                          <span>{p.name}</span>
                        </span>
                        <input
                          aria-label={`${p.name} share weight`}
                          type="number"
                          min="0"
                          step="0.1"
                          value={draft.weights[p.id] ?? "1"}
                          onChange={(e) =>
                            patch({
                              weights: {
                                ...draft.weights,
                                [p.id]: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                </div>
              </>
            )}
            {tab === "payments" && (
              <>
                <Field
                  label="Balance payment due (optional)"
                  hint="Adds a reminder when a booked item has a balance due within seven days."
                >
                  <input
                    type="date"
                    value={draft.paymentDueDate ?? ""}
                    onChange={(e) =>
                      patch({ paymentDueDate: e.target.value || null })
                    }
                  />
                </Field>
                <p className="muted">
                  A deposit is part of the cost, not another expense. Record who
                  paid and what was actually charged.
                </p>
                {draft.payments.map((payment) => (
                  <div className="cost-line-editor" key={payment.id}>
                    <div className="form-grid three">
                      <Field label="Paid by">
                        <Select
                          value={payment.payerId}
                          onValueChange={(nextValue) =>
                            patch({
                              payments: draft.payments.map((p) =>
                                p.id === payment.id
                                  ? { ...p, payerId: nextValue }
                                  : p,
                              ),
                            })
                          }
                        >
                          {state.participants.map((p) => (
                            <SelectOption key={p.id} value={p.id}>
                              {p.name}
                            </SelectOption>
                          ))}
                        </Select>
                      </Field>
                      <Field label={`Amount (${payment.currency})`}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={payment.amount}
                          onChange={(e) =>
                            patch({
                              payments: draft.payments.map((p) =>
                                p.id === payment.id
                                  ? { ...p, amount: e.target.value }
                                  : p,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={payment.kind}
                          onValueChange={(nextValue) =>
                            patch({
                              payments: draft.payments.map((p) =>
                                p.id === payment.id
                                  ? { ...p, kind: nextValue as any }
                                  : p,
                              ),
                            })
                          }
                        >
                          <SelectOption value="payment">
                            Payment / deposit
                          </SelectOption>
                          <SelectOption value="refund">Refund</SelectOption>
                        </Select>
                      </Field>
                    </div>
                    <div className="form-grid">
                      <Field label="Payment currency">
                        <input
                          maxLength={3}
                          value={payment.currency}
                          onChange={(e) =>
                            patch({
                              payments: draft.payments.map((p) =>
                                p.id === payment.id
                                  ? {
                                      ...p,
                                      currency: e.target.value.toUpperCase(),
                                    }
                                  : p,
                              ),
                            })
                          }
                        />
                      </Field>
                      <Field label={`Exchange rate to ${state.currency}`}>
                        <input
                          type="number"
                          step="any"
                          min="0.00000001"
                          value={payment.rate}
                          onChange={(e) =>
                            patch({
                              payments: draft.payments.map((p) =>
                                p.id === payment.id
                                  ? { ...p, rate: e.target.value }
                                  : p,
                              ),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <Field
                      label={`Actual card debit in ${state.currency} (optional)`}
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={payment.actualBase ?? ""}
                        onChange={(e) =>
                          patch({
                            payments: draft.payments.map((p) =>
                              p.id === payment.id
                                ? {
                                    ...p,
                                    actualBase: e.target.value || undefined,
                                  }
                                : p,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Date">
                      <input
                        type="date"
                        value={payment.rateDate}
                        onChange={(e) =>
                          patch({
                            payments: draft.payments.map((p) =>
                              p.id === payment.id
                                ? { ...p, rateDate: e.target.value }
                                : p,
                            ),
                          })
                        }
                      />
                    </Field>
                    <Field label="Note">
                      <input
                        value={payment.note}
                        onChange={(e) =>
                          patch({
                            payments: draft.payments.map((p) =>
                              p.id === payment.id
                                ? { ...p, note: e.target.value }
                                : p,
                            ),
                          })
                        }
                      />
                    </Field>
                    <button
                      type="button"
                      className="plain-link danger-text"
                      onClick={() =>
                        patch({
                          payments: draft.payments.filter(
                            (p) => p.id !== payment.id,
                          ),
                        })
                      }
                    >
                      <Trash size={16} /> Remove payment
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    patch({
                      payments: [
                        ...draft.payments,
                        {
                          id: makeId(),
                          payerId: state.participants[0]!.id,
                          amount: "0",
                          currency: state.currency,
                          rate: "1",
                          rateDate: today,
                          kind: "payment",
                          note: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={18} /> Record a payment
                </Button>
              </>
            )}
          </MotionPanel>
        </fieldset>
        <div className="editor-footer">
          <div>
            <small>Planned / paid</small>
            <strong>
              {(() => {
                try {
                  return `${money(itemTotal(draft), state.currency)} / ${money(itemPaid(draft), state.currency)}`;
                } catch {
                  return "Complete the amounts";
                }
              })()}
            </strong>
          </div>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          {!readOnly && (
            <Button type="submit" loading={busy}>
              Save to my trip <ArrowUpRight size={18} />
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
