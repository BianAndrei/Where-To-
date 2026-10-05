import { Disclosure } from "./motion";
import { useState } from "react";
import Decimal from "decimal.js";
import { CheckCircle, Plus, Trash, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  makeId,
  money,
  itemTotal,
  parseReceiptText,
  receiptShares,
  receiptSchema,
  type Receipt,
  type TripState,
} from "@whereto/shared";
import { fingerprint, readPlanningFile } from "../lib/planning-files";
import { Field, Modal, Button, Notice } from "./ui";
import { Select, SelectOption } from "./Select";
import type { SaveImport } from "./PlanningImport";
export default function ReceiptImport({
  state,
  onClose,
  onSave,
  initialItemId,
  demo,
}: {
  state: TripState;
  onClose: () => void;
  onSave: SaveImport;
  initialItemId?: string;
  demo: boolean;
}) {
  const meals = state.items.filter(
    (i) => !i.deletedAt && i.state !== "idea" && i.kind === "restaurant",
  );
  const [itemId, setItemId] = useState(initialItemId ?? meals[0]?.id ?? "");
  const [text, setText] = useState(""),
    [file, setFile] = useState<File>(),
    [language, setLanguage] = useState("eng");
  const [receipt, setReceipt] = useState<Receipt>(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [savedReceipt, setSavedReceipt] = useState(false);
  const item = meals.find((i) => i.id === itemId);
  let shares: Record<string, string> | undefined,
    validation = "";
  if (receipt)
    try {
      shares = receiptShares(receipt, state.participants);
    } catch (e) {
      validation = (e as Error).message;
    }
  async function read(f: File) {
    setBusy(true);
    setError("");
    setFile(undefined);
    try {
      setText(await readPlanningFile(f, setProgress, language));
      setFile(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    setBusy(true);
    setError("");
    try {
      const parsed = parseReceiptText(text);
      setReceipt({
        fingerprint: await fingerprint(file ?? text),
        currency: parsed.currency ?? "",
        rate: parsed.currency === state.currency ? "1" : "",
        rateDate: new Date().toISOString().slice(0, 10),
        total: parsed.total ?? "",
        rows: parsed.rows.map((r) => ({
          id: makeId(),
          ...r,
          amount: r.amount ?? "",
          participantIds: state.participants.map((p) => p.id),
        })),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function patchRow(id: string, patch: Partial<Receipt["rows"][number]>) {
    setConfirmed(false);
    setReceipt(
      (r) =>
        r && {
          ...r,
          rows: r.rows.map((row) =>
            row.id === id ? { ...row, ...patch } : row,
          ),
        },
    );
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="A fair share of a lovely meal."
      description="Read a receipt, check every row, then assign what each person had."
      wide
    >
      <div className="planning-stack">
        {savedReceipt ? (
          <div className="receipt-saved" role="status">
            <CheckCircle size={38} aria-hidden="true" />
            <div>
              <span className="eyebrow">SAVED TO YOUR SHARED TRIP</span>
              <h3>Receipt added to {item?.title ?? "your meal"}.</h3>
              <p>
                {money(receipt!.total, receipt!.currency)} is recorded once,
                with the item-by-item split. Existing payments were kept.
              </p>
            </div>
            <Button onClick={onClose}>Done</Button>
          </div>
        ) : !meals.length ? (
          <Notice>
            Add a restaurant or meal to your itinerary first. Its receipt will
            update that same meal.
          </Notice>
        ) : (
          <>
            <Field label="Which meal is this for?">
              <Select
                value={itemId}
                onValueChange={(v) => {
                  setItemId(v);
                  setConfirmed(false);
                }}
              >
                {meals.map((i) => (
                  <SelectOption key={i.id} value={i.id}>
                    {i.title} · {i.day ?? "Unscheduled"}
                  </SelectOption>
                ))}
              </Select>
            </Field>
            {!receipt ? (
              <>
                <Field label="Receipt language">
                  <Select value={language} onValueChange={setLanguage}>
                    {[
                      ["eng", "English"],
                      ["ron", "Romanian"],
                      ["por", "Portuguese"],
                      ["fra", "French"],
                      ["ita", "Italian"],
                      ["spa", "Spanish"],
                      ["deu", "German"],
                    ].map(([v, label]) => (
                      <SelectOption key={v} value={v}>
                        {label}
                      </SelectOption>
                    ))}
                  </Select>
                </Field>
                <label className="planning-upload">
                  <UploadSimple size={24} />
                  <span>
                    Photograph or upload your receipt
                    <small>
                      Text recognition runs on your device · up to 8 MB
                    </small>
                  </span>
                  <input
                    type="file"
                    disabled={busy}
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.txt"
                    onChange={(e) =>
                      e.target.files?.[0] && void read(e.target.files[0])
                    }
                  />
                </label>
                {file && (
                  <div className="planning-actions">
                    <small>Original attached: {file.name}</small>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setFile(undefined)}
                    >
                      Use pasted text instead
                    </Button>
                  </div>
                )}
                <Field label="Receipt text">
                  <textarea
                    rows={6}
                    maxLength={100000}
                    disabled={busy}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Pasta 14.00&#10;Salad 10.00&#10;Total EUR 24.00"
                  />
                </Field>
                <p className="muted">
                  The first photo may take longer while the language reader
                  downloads. Unclear prices stay empty for you to check.
                </p>
                <div className="planning-actions">
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setFile(undefined);
                      setText(
                        "Pasta 14.00\nSalad 10.00\nDrinks 8.00\nTotal EUR 32.00",
                      );
                    }}
                  >
                    Use sample receipt
                  </Button>
                  <Button
                    loading={busy}
                    disabled={!text.trim()}
                    onClick={() => void preview()}
                  >
                    Review receipt
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="planning-review">
                  <b>Check the line totals, including quantities.</b>
                  <p>
                    Remove subtotals or tax already included. Add any missing
                    tip, extra charge or discount. The rows must match the
                    receipt total.
                  </p>
                  <Disclosure>
                    <summary>Show original text</summary>
                    <pre className="planning-source">{text}</pre>
                  </Disclosure>
                </div>
                <div className="form-grid three receipt-currency">
                  <Field label="Currency">
                    <input
                      maxLength={3}
                      value={receipt.currency}
                      placeholder="EUR"
                      onChange={(e) => {
                        const currency = e.target.value.toUpperCase();
                        setReceipt({
                          ...receipt,
                          currency,
                          rate: currency === state.currency ? "1" : "",
                        });
                        setConfirmed(false);
                      }}
                    />
                  </Field>
                  <Field
                    label={`1 ${receipt.currency || "local unit"} in ${state.currency}`}
                  >
                    <input
                      type="number"
                      min="0.00000001"
                      step="any"
                      value={receipt.rate}
                      disabled={receipt.currency === state.currency}
                      onChange={(e) => {
                        setReceipt({ ...receipt, rate: e.target.value });
                        setConfirmed(false);
                      }}
                    />
                  </Field>
                  <Field label="Rate date">
                    <input
                      type="date"
                      value={receipt.rateDate}
                      onChange={(e) => {
                        setReceipt({ ...receipt, rateDate: e.target.value });
                        setConfirmed(false);
                      }}
                    />
                  </Field>
                </div>
                {receipt.rows.map((row, index) => (
                  <div className="receipt-row" key={row.id}>
                    <div className="receipt-row-fields">
                      <Field label={`Item ${index + 1}`}>
                        <input
                          value={row.label}
                          maxLength={120}
                          onChange={(e) =>
                            patchRow(row.id, { label: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Line total">
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={row.amount}
                          onChange={(e) =>
                            patchRow(row.id, { amount: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={row.kind}
                          onValueChange={(v) =>
                            patchRow(row.id, {
                              kind: v as "purchase" | "discount",
                            })
                          }
                        >
                          <SelectOption value="purchase">
                            Purchase / charge
                          </SelectOption>
                          <SelectOption value="discount">Discount</SelectOption>
                        </Select>
                      </Field>
                      <button
                        className="icon-button"
                        aria-label={`Remove receipt row ${index + 1}`}
                        onClick={() => {
                          setReceipt({
                            ...receipt,
                            rows: receipt.rows.filter((r) => r.id !== row.id),
                          });
                          setConfirmed(false);
                        }}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                    <div
                      className="receipt-people"
                      role="group"
                      aria-label={`Who shares ${row.label || "this item"}?`}
                    >
                      {state.participants.map((p) => (
                        <label className="checkbox-label" key={p.id}>
                          <input
                            type="checkbox"
                            checked={row.participantIds.includes(p.id)}
                            onChange={(e) =>
                              patchRow(row.id, {
                                participantIds: e.target.checked
                                  ? [...row.participantIds, p.id]
                                  : row.participantIds.filter(
                                      (id) => id !== p.id,
                                    ),
                              })
                            }
                          />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReceipt({
                      ...receipt,
                      rows: [
                        ...receipt.rows,
                        {
                          id: makeId(),
                          label: "",
                          amount: "",
                          kind: "purchase",
                          participantIds: state.participants.map((p) => p.id),
                        },
                      ],
                    });
                    setConfirmed(false);
                  }}
                  disabled={receipt.rows.length >= 100}
                >
                  <Plus size={17} /> Add missing item
                </Button>
                <Field label="Confirmed receipt total">
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={receipt.total}
                    onChange={(e) => {
                      setReceipt({ ...receipt, total: e.target.value });
                      setConfirmed(false);
                    }}
                  />
                </Field>
                {shares ? (
                  <div className="receipt-shares">
                    <h3>Who had what</h3>
                    {state.participants
                      .filter((p) => shares[p.id] !== undefined)
                      .map((p) => (
                        <div key={p.id}>
                          <span>{p.name}</span>
                          <b>
                            {money(
                              new Decimal(shares[p.id]!).times(receipt.rate),
                              state.currency,
                            )}
                          </b>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="muted">
                    {validation.includes("[")
                      ? "Complete the currency, price and assignment fields to preview the split."
                      : validation}
                  </p>
                )}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I checked the receipt. Replace this meal’s current cost{" "}
                  {item ? `(${money(itemTotal(item), state.currency)})` : ""}{" "}
                  and split. Existing payments stay unchanged.
                </label>
                <p className="muted">
                  This records the cost and each person's share. Record who paid
                  in the meal’s Payments tab.{" "}
                  {demo
                    ? "The demo keeps the result on this device; original files are attached in your own trips."
                    : "The original receipt stays private with this meal."}
                </p>
                <div className="planning-actions">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setReceipt(undefined);
                      setConfirmed(false);
                    }}
                  >
                    Back to receipt
                  </Button>
                  <Button
                    disabled={!confirmed || !shares || !item}
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        await onSave(
                          {
                            type: "receipt.save",
                            itemId,
                            receipt: receiptSchema.parse(receipt),
                          },
                          { file, text },
                        );
                        toast.success(
                          "Receipt saved. The meal and its split are up to date.",
                        );
                        setSavedReceipt(true);
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Update this meal
                  </Button>
                </div>
              </>
            )}
          </>
        )}
        {busy && <p role="status">{progress || "Preparing your receipt…"}</p>}
        {error && <Notice error>{error}</Notice>}
      </div>
    </Modal>
  );
}
