import { Select, SelectOption } from "./Select";
import { useState } from "react";
import { itemTotal, money, type TripState } from "@whereto/shared";
import { Field, Button, Notice } from "./ui";
import { post } from "../lib/api";
export default function CompareOptions({
  state,
  demo,
}: {
  state: TripState;
  demo: boolean;
}) {
  const choices = state.items.filter((i) => !i.deletedAt);
  const [left, setLeft] = useState(choices[0]?.id || ""),
    [right, setRight] = useState(
      choices.find((i) => i.state === "idea")?.id || choices[1]?.id || "",
    ),
    [times, setTimes] = useState<number[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const a = choices.find((i) => i.id === left),
    b = choices.find((i) => i.id === right);
  const start =
    state.items.find(
      (i) => i.kind === "accommodation" && !i.deletedAt && i.state !== "idea",
    )?.location ?? state.destinations[0];
  return (
    <>
      <div className="form-grid">
        {[
          [left, setLeft, "Option A"],
          [right, setRight, "Option B"],
        ].map(([value, setValue, label]) => (
          <Field key={String(label)} label={String(label)}>
            <Select
              value={String(value)}
              onValueChange={(nextValue) => {
                (setValue as typeof setLeft)(nextValue);
                setTimes(null);
              }}
            >
              {choices.map((i) => (
                <SelectOption key={i.id} value={i.id}>
                  {i.title} · {i.state}
                </SelectOption>
              ))}
            </Select>
          </Field>
        ))}
      </div>
      {a && b && (
        <>
          <div className="comparison-list">
            {[a, b].map((i, n) => (
              <div key={n}>
                <strong>{i.title}</strong>
                <span>{money(itemTotal(i), state.currency)}</span>
                <small>
                  {state.participants.length
                    ? money(
                        itemTotal(i).div(state.participants.length),
                        state.currency,
                      )
                    : "—"}{" "}
                  / person
                </small>
              </div>
            ))}
          </div>
          <Notice>
            {a.id === b.id
              ? "Choose two different options."
              : `${b.title} costs ${money(itemTotal(b).minus(itemTotal(a)).abs(), state.currency)} ${itemTotal(b).gte(itemTotal(a)) ? "more" : "less"} for your group.`}
          </Notice>
          <Button
            variant="secondary"
            loading={busy}
            disabled={a.id === b.id || !a.location || !b.location}
            onClick={async () => {
              setError("");
              if (demo) {
                setError(
                  "Live route comparison needs a connected map provider in your own trip.",
                );
                return;
              }
              setBusy(true);
              try {
                const x = await post("/routes", {
                    a: start,
                    b: a.location,
                    mode: "walk",
                  }),
                  y = await post("/routes", {
                    a: start,
                    b: b.location,
                    mode: "walk",
                  });
                setTimes([x.minutes, y.minutes]);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Compare walking time from your stay
          </Button>
          {times && (
            <p>
              {Math.ceil(times[0]!)} min to option A · {Math.ceil(times[1]!)}{" "}
              min to option B. Difference:{" "}
              {Math.round(Math.abs(times[1]! - times[0]!))} min.
            </p>
          )}
        </>
      )}
      {error && <Notice>{error}</Notice>}
      <p className="fine-print">
        Only planned options enter your total. Times appear only when a route
        provider returns them.
      </p>
    </>
  );
}
