import { useState } from "react";
import {
  CATEGORIES,
  itemSchema,
  itemTotal,
  makeId,
  money,
  localDate,
  type TripItem,
  type TripState,
} from "@whereto/shared";
import { Button, Field, Modal, Notice } from "./ui";
import { Select, SelectOption } from "./Select";
import { LiquidToggle } from "./PlayfulControls";

export default function QuickAdd({
  item,
  state,
  expense,
  onSave,
  onDetails,
  onClose,
}: {
  item: TripItem;
  state: TripState;
  expense: boolean;
  onSave: (item: TripItem) => Promise<void>;
  onDetails: (item: TripItem) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(item);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"estimated" | "confirmed">(
    expense ? "confirmed" : "estimated",
  );
  const [paid, setPaid] = useState(false);
  const [payer, setPayer] = useState(state.participants[0]!.id);
  const [linkedId, setLinkedId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const linked = state.items.find(
    (candidate) =>
      candidate.id === linkedId &&
      !candidate.deletedAt &&
      candidate.state !== "idea",
  );
  const rateDate = localDate(state.destinations[0]!.timezone);
  const patch = (changes: Partial<TripItem>) =>
    setDraft((previous) => ({ ...previous, ...changes }));

  function prepare(): TripItem {
    if (linkedId && !linked)
      throw new Error(
        "That item has changed. Choose an existing item again or create a new expense.",
      );
    const result = structuredClone(linked ?? draft);
    result.title = result.title.trim();
    if (amount !== "") {
      if (!linked)
        result.lines = [
          {
            id: makeId(),
            label: result.title || "Group cost",
            price: amount,
            quantity: "1",
            multiplier: "1",
            unit: "group",
            currency: state.currency,
            rate: "1",
            rateDate,
            status,
          },
        ];
      if (linked || paid)
        result.payments.push({
          id: makeId(),
          payerId: payer,
          amount,
          currency: state.currency,
          rate: "1",
          rateDate,
          kind: "payment",
          note: "",
        });
    }
    return result;
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const prepared = prepare();
      if (!prepared.title)
        throw new Error(
          "Give this item a name so you can find it in your plan.",
        );
      const parsed = itemSchema.safeParse(prepared);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message ?? "Check the details and try again.",
        );
      await onSave(parsed.data);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "We couldn’t save that. Your details are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={expense ? "A quick money moment." : "Add to your trip."}
      description={
        expense
          ? "Record a new cost or a payment for something already in your plan."
          : "Start with the essentials. You can add more details anytime."
      }
    >
      <form onSubmit={save}>
        {error && <Notice error>{error}</Notice>}
        <fieldset disabled={busy} className="editor-fieldset quick-add-fields">
          {expense && (
            <Field label="What are you adding?">
              <Select value={linkedId} onValueChange={setLinkedId}>
                <SelectOption value="">A new expense</SelectOption>
                {state.items
                  .filter(
                    (candidate) =>
                      !candidate.deletedAt && candidate.state !== "idea",
                  )
                  .map((candidate) => (
                    <SelectOption key={candidate.id} value={candidate.id}>
                      Payment for {candidate.title}
                    </SelectOption>
                  ))}
              </Select>
            </Field>
          )}
          {!linkedId && (
            <>
              <Field label={expense ? "What was it for?" : "What’s the plan?"}>
                <input
                  autoFocus={!expense}
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) => patch({ title: event.target.value })}
                  placeholder={
                    expense
                      ? "Coffee, train tickets, souvenirs…"
                      : "That museum, a sunset walk…"
                  }
                />
              </Field>
              <div className="form-grid">
                <Field label="Day (optional)">
                  <input
                    type="date"
                    min={state.startDate}
                    max={state.endDate}
                    value={draft.day ?? ""}
                    onChange={(event) =>
                      patch({ day: event.target.value || null })
                    }
                  />
                </Field>
                {expense ? (
                  <Field label="Category">
                    <Select
                      value={draft.category}
                      onValueChange={(category) => patch({ category })}
                    >
                      {[...new Set([...CATEGORIES, ...state.categories])].map(
                        (category) => (
                          <SelectOption key={category}>{category}</SelectOption>
                        ),
                      )}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Time (optional)">
                    <input
                      type="time"
                      value={draft.time ?? ""}
                      onChange={(event) =>
                        patch({ time: event.target.value || null })
                      }
                    />
                  </Field>
                )}
              </div>
            </>
          )}
          {linked && (
            <p className="quick-payment-note">
              This records a payment for <strong>{linked.title}</strong>. Its
              planned cost stays {money(itemTotal(linked), state.currency)}; it
              won’t be counted twice.
            </p>
          )}
          <div className={linkedId ? undefined : "form-grid"}>
            <Field
              label={
                linkedId
                  ? `Payment amount (${state.currency})`
                  : `Group cost (${state.currency})${expense ? "" : " · optional"}`
              }
              hint={
                linkedId
                  ? "For a deposit, enter only what you paid."
                  : "The total for the group, counted once. Leave an unknown cost blank."
              }
            >
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="1000000000"
                step="0.01"
                required={expense || paid}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </Field>
            {!linkedId && (
              <Field label="Cost type">
                <Select
                  value={status}
                  onValueChange={(value) => setStatus(value as typeof status)}
                >
                  <SelectOption value="estimated">Estimate</SelectOption>
                  <SelectOption value="confirmed">Confirmed cost</SelectOption>
                </Select>
              </Field>
            )}
          </div>
          {!linkedId && draft.state !== "idea" && (
            <LiquidToggle
              checked={paid}
              onChange={(event) => setPaid(event.target.checked)}
            >
              Already paid in full
            </LiquidToggle>
          )}
          {(linkedId || paid) && (
            <Field label="Paid by">
              <Select value={payer} onValueChange={setPayer}>
                {state.participants.map((person) => (
                  <SelectOption key={person.id} value={person.id}>
                    {person.name}
                  </SelectOption>
                ))}
              </Select>
            </Field>
          )}
          {draft.state === "idea" && (
            <p className="muted">
              This stays an idea and is excluded from the trip budget until you
              include it.
            </p>
          )}
          <button
            type="button"
            className="plain-link quick-details"
            onClick={() => {
              try {
                onDetails(prepare());
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            More details: place, booking, prices & payments →
          </button>
        </fieldset>
        <div className="modal-actions">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {linkedId ? "Save payment" : "Save to my trip"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
