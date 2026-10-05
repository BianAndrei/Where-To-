import { Disclosure } from "./motion";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  UploadSimple,
  Receipt,
  UsersThree,
  Train,
} from "@phosphor-icons/react";
import {
  makeId,
  missingPieces,
  packingSuggestions,
  PACKING_THEMES,
  type Command,
  type MissingPiece,
  type TripState,
} from "@whereto/shared";
import { Button, Notice } from "./ui";
import "./planning.css";
export function PlanningEssentials({
  state,
  onFix,
  onImport,
  onReceipt,
  onPolls,
  onTransfers,
  disabled,
}: {
  state: TripState;
  onFix: (p: MissingPiece) => void;
  onImport: () => void;
  onReceipt: () => void;
  onPolls: () => void;
  onTransfers: () => void;
  disabled: boolean;
}) {
  const missing = missingPieces(state);
  const openPollCount =
    state.polls?.filter((poll) => poll.status === "open").length ?? 0;
  return (
    <section className="planning-essentials" aria-label="Trip essentials">
      <div className="planning-shortcuts">
        <button disabled={disabled} onClick={onImport}>
          <UploadSimple size={18} /> Import a booking
        </button>
        <button disabled={disabled} onClick={onReceipt}>
          <Receipt size={18} /> Split a receipt
        </button>
        <button
          disabled={disabled}
          onClick={onPolls}
          aria-label={
            openPollCount
              ? `Group votes, ${openPollCount} open`
              : "Group votes"
          }
        >
          <UsersThree size={18} /> Group votes
          {openPollCount > 0 && (
            <span
              className="nav-count poll-alert"
              aria-label={`${openPollCount} open group votes`}
            >
              {openPollCount}
            </span>
          )}
        </button>
        <button disabled={disabled} onClick={onTransfers}>
          <Train size={18} /> Airport transfers
        </button>
      </div>
      <Disclosure className="missing-pieces">
        <summary>
          <span>
            <b>What’s still missing?</b>
            <small>
              {missing.length
                ? `${missing.length} ${missing.length === 1 ? "thing" : "things"} to check, one step at a time.`
                : "No gaps found in stays, transfers, costs or payment deadlines."}
            </small>
          </span>
          <span>{missing.length || <Check size={19} />}</span>
        </summary>
        <div className="missing-list">
          {missing.map((p) => (
            <div key={p.id}>
              <span>
                <b>{p.title}</b>
                <small>{p.detail}</small>
              </span>
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => onFix(p)}
                aria-label={`${p.title}: ${p.detail}`}
              >
                {p.action === "transfer"
                  ? "Plan transfer"
                  : p.action === "stay"
                    ? "Add stay"
                    : p.action === "payment"
                      ? "View payment"
                      : "Add estimate"}
                <ArrowRight size={17} />
              </Button>
            </div>
          ))}
          <small className="muted">
            Based on your saved plan. This checks for gaps; it does not verify
            bookings with providers.
          </small>
        </div>
      </Disclosure>
    </section>
  );
}
export function PackingSuggestions({
  state,
  onCommand,
}: {
  state: TripState;
  onCommand: (c: Command) => Promise<void>;
}) {
  const [themes, setThemes] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const suggestions = packingSuggestions(state, themes);
  return (
    <Disclosure className="packing-suggestions">
      <summary>Suggest a few essentials for this trip</summary>
      <div className="planning-stack">
        <p>
          Suggestions use your trip length and planned activities. Pick what
          fits your plans.
        </p>
        <div
          className="receipt-people"
          role="group"
          aria-label="Packing activities"
        >
          {PACKING_THEMES.map((t) => (
            <label className="checkbox-label" key={t}>
              <input
                type="checkbox"
                checked={themes.includes(t)}
                onChange={(e) =>
                  setThemes(
                    e.target.checked
                      ? [...themes, t]
                      : themes.filter((x) => x !== t),
                  )
                }
              />
              {t[0]!.toUpperCase() + t.slice(1)}
            </label>
          ))}
        </div>
        {suggestions.map((s) => (
          <label className="checkbox-label packing-option" key={s.text}>
            <input
              type="checkbox"
              checked={selected.includes(s.text)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, s.text]
                    : selected.filter((t) => t !== s.text),
                )
              }
            />
            <span>
              {s.text}
              <small>{s.reason}</small>
            </span>
          </label>
        ))}
        {!suggestions.length && (
          <p>These essentials are already in your checklist.</p>
        )}
        <Button
          loading={busy}
          disabled={!suggestions.some((s) => selected.includes(s.text))}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onCommand({
                type: "checklist",
                checklist: [
                  ...state.checklist,
                  ...suggestions
                    .filter((s) => selected.includes(s.text))
                    .map((s) => ({
                      id: makeId(),
                      text: s.text,
                      group: s.group,
                      done: false,
                    })),
                ],
              });
              setSelected([]);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Add selected essentials
        </Button>
        {error && <Notice error>{error}</Notice>}
      </div>
    </Disclosure>
  );
}
