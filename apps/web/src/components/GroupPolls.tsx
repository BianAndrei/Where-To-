import { Disclosure } from "./motion";
import { useState } from "react";
import {
  makeId,
  itemTotal,
  money,
  type Command,
  type TripState,
} from "@whereto/shared";
import { Modal, Field, Button, Notice } from "./ui";
import { Select, SelectOption } from "./Select";
import { Doodle } from "./Doodle";
export default function GroupPolls({
  state,
  owner,
  actorId,
  onCommand,
  onClose,
  onIdeas,
}: {
  state: TripState;
  owner: boolean;
  actorId: string;
  onCommand: (c: Command) => Promise<void>;
  onClose: () => void;
  onIdeas: () => void;
}) {
  const [question, setQuestion] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [day, setDay] = useState(state.startDate);
  const ideas = state.items.filter(
    (i) =>
      !i.deletedAt &&
      i.state === "idea" &&
      ["activity", "restaurant"].includes(i.kind) &&
      !state.polls?.some(
        (p) => p.status === "open" && p.optionIds.includes(i.id),
      ),
  );
  async function run(c: Command) {
    setBusy(true);
    setError("");
    try {
      await onCommand(c);
      if (c.type === "poll.create") {
        setQuestion("");
        setIds([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="A plan everyone can get behind."
      description="Vote on saved ideas. Your organiser adds the chosen option to a day."
      wide
    >
      <div className="planning-stack">
        <div className="planning-intro">
          <Doodle name="sun" />
          <p>
            Each signed-in collaborator gets one vote per poll and can change it
            while voting is open. Ideas stay outside the budget until confirmed.
          </p>
        </div>
        {(state.polls ?? [])
          .slice()
          .reverse()
          .map((p) => (
            <article className="group-poll" key={p.id}>
              <span className="eyebrow">
                {p.status === "open"
                  ? "LET’S DECIDE"
                  : p.status === "resolved"
                    ? "ADDED TO THE PLAN"
                    : "CLOSED"}
              </span>
              <h3>{p.question}</h3>
              {p.optionIds.map((id) => {
                const item = state.items.find((i) => i.id === id);
                const votes = p.votes.filter((v) => v.optionId === id);
                const voted = votes.some((v) => v.userId === actorId);
                return (
                  <div
                    className={`poll-option ${voted ? "voted" : ""}`}
                    key={id}
                  >
                    <div>
                      <strong>{item?.title ?? "Removed idea"}</strong>
                      <small>
                        {item?.lines.length
                          ? money(itemTotal(item), state.currency) +
                            " for the group"
                          : "Cost not estimated"}
                        {p.selectedId === id ? " · Chosen" : ""}
                      </small>
                      <span>
                        {votes.length} {votes.length === 1 ? "vote" : "votes"}
                        {votes.length > 0
                          ? ` · ${votes.map((v) => v.name).join(", ")}`
                          : ""}
                      </span>
                    </div>
                    {p.status === "open" && (
                      <Button
                        loading={busy}
                        variant={voted ? "primary" : "secondary"}
                        aria-pressed={voted}
                        onClick={() =>
                          void run({
                            type: "poll.vote",
                            id: p.id,
                            optionId: voted ? null : id,
                          })
                        }
                      >
                        {voted ? "Voted ✓" : "Vote"}
                      </Button>
                    )}
                  </div>
                );
              })}
              {p.status === "open" && owner && (
                <div className="poll-decision">
                  <div className="form-grid">
                    <Field label="Organiser’s choice">
                      <Select
                        value={choices[p.id] ?? ""}
                        onValueChange={(v) =>
                          setChoices({ ...choices, [p.id]: v })
                        }
                      >
                        <SelectOption value="">Choose an option</SelectOption>
                        {p.optionIds.map((id) => (
                          <SelectOption key={id} value={id}>
                            {state.items.find((i) => i.id === id)?.title ??
                              "Removed idea"}
                          </SelectOption>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Add to day">
                      <input
                        type="date"
                        min={state.startDate}
                        max={state.endDate}
                        value={day}
                        onChange={(e) => setDay(e.target.value)}
                      />
                    </Field>
                  </div>
                  <p className="muted">
                    Only the chosen idea enters the itinerary and budget. Other
                    options remain ideas.
                  </p>
                  <div className="planning-actions">
                    <Button
                      variant="ghost"
                      loading={busy}
                      onClick={() =>
                        void run({ type: "poll.cancel", id: p.id })
                      }
                    >
                      Close without choosing
                    </Button>
                    <Button
                      loading={busy}
                      disabled={!choices[p.id] || !day}
                      onClick={() =>
                        void run({
                          type: "poll.resolve",
                          id: p.id,
                          selectedId: choices[p.id]!,
                          day,
                        })
                      }
                    >
                      Confirm and add to trip
                    </Button>
                  </div>
                </div>
              )}
            </article>
          ))}
        <Disclosure className="poll-create" open={!state.polls?.length}>
          <summary>Start a group vote</summary>
          <div className="planning-stack">
            <Field label="What are we deciding?">
              <input
                value={question}
                maxLength={200}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="A boat trip or an afternoon at the aquarium?"
              />
            </Field>
            {ideas.length < 2 ? (
              <Notice>
                Save at least two alternatives in Ideas first.{" "}
                <Button variant="ghost" onClick={onIdeas}>
                  Go to ideas
                </Button>
              </Notice>
            ) : (
              <fieldset className="planning-options">
                <legend>Choose 2–8 ideas</legend>
                {ideas.map((i) => (
                  <label className="checkbox-label" key={i.id}>
                    <input
                      type="checkbox"
                      checked={ids.includes(i.id)}
                      disabled={!ids.includes(i.id) && ids.length >= 8}
                      onChange={(e) =>
                        setIds(
                          e.target.checked
                            ? [...ids, i.id]
                            : ids.filter((id) => id !== i.id),
                        )
                      }
                    />
                    {i.title}
                    <small>
                      {i.lines.length
                        ? money(itemTotal(i), state.currency)
                        : "Needs estimate"}
                    </small>
                  </label>
                ))}
              </fieldset>
            )}
            <Button
              loading={busy}
              disabled={ids.length < 2 || question.trim().length < 3}
              onClick={() =>
                void run({
                  type: "poll.create",
                  id: makeId(),
                  question: question.trim(),
                  optionIds: ids,
                })
              }
            >
              Open voting
            </Button>
          </div>
        </Disclosure>
        {error && <Notice error>{error}</Notice>}
      </div>
    </Modal>
  );
}
