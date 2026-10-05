import { Disclosure } from "./motion";
import { useState } from "react";
import { UploadSimple, ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  parseReservationText,
  reservationDuplicate,
  money,
  itemTotal,
  type TripItem,
  type TripState,
  type Command,
} from "@whereto/shared";
import { fingerprint, readPlanningFile } from "../lib/planning-files";
import { Button, Field, Modal, Notice } from "./ui";
import { Select, SelectOption } from "./Select";
import { Doodle } from "./Doodle";
import ItemEditor from "./ItemEditor";

export type SaveImport = (
  command: Extract<Command, { type: "item.save" | "receipt.save" }>,
  source: { file?: File; text: string },
) => Promise<void>;
export default function PlanningImport({
  state,
  onClose,
  onSave,
  onExisting,
  demo,
}: {
  state: TripState;
  onClose: () => void;
  onSave: SaveImport;
  onExisting: (item: TripItem) => void;
  demo: boolean;
}) {
  const [kind, setKind] = useState<"accommodation" | "transport" | "activity">(
    "accommodation",
  );
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const bookings = state.items.filter(
    (i) =>
      !i.deletedAt &&
      i.state === "booked" &&
      ["accommodation", "flight", "transport", "activity"].includes(i.kind),
  );
  const [file, setFile] = useState<File>();
  const [review, setReview] =
    useState<ReturnType<typeof parseReservationText>>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  async function read(f: File) {
    setBusy(true);
    setError("");
    setFile(undefined);
    try {
      setText(await readPlanningFile(f, setProgress));
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
      const parsed = parseReservationText(text, kind, state);
      parsed.draft.reservation = {
        fingerprint: await fingerprint(file ?? text),
        reference: parsed.reference,
        source: file?.name.toLowerCase().endsWith(".pdf")
          ? "pdf"
          : file?.type.startsWith("image/")
            ? "image"
            : "text",
        importedAt: new Date().toISOString(),
      };
      setReview(parsed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (review) {
    const duplicate = reservationDuplicate(state.items, review.draft);
    return (
      <ItemEditor
        item={review.draft}
        state={state}
        demo={demo}
        onClose={onClose}
        intro={
          <div className="planning-review">
            <span className="eyebrow">CHECK BEFORE YOU KEEP IT</span>
            <h3>Your reservation, unfolded.</h3>
            {review.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            {review.placeHint && (
              <p>
                <b>Location in confirmation:</b> {review.placeHint}
              </p>
            )}
            {review.endHint && (
              <p>
                <b>Arrival station:</b> {review.endHint}
              </p>
            )}
            {duplicate && (
              <Notice error>
                This looks like “{duplicate.title}”, already in your trip.{" "}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onClose();
                    onExisting(duplicate);
                  }}
                >
                  Open existing reservation
                </Button>
              </Notice>
            )}
            <p>
              {demo
                ? "Example trip: file attachments are saved only in your own trips."
                : `${file?.name ?? "Original confirmation text"} will be saved as a private document with this reservation.`}
            </p>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setReview(undefined)}
            >
              Back to source
            </Button>
          </div>
        }
        onSave={async (item) => {
          const match = reservationDuplicate(state.items, item);
          if (match)
            throw new Error(
              `This reservation is already saved as “${match.title}”.`,
            );
          await onSave({ type: "item.save", item }, { file, text });
          toast.success("Reservation added. Your day and budget are in sync.");
        }}
      />
    );
  }
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Keep every booking together."
      description="Import a hotel, train or activity confirmation. Check the details before it joins your trip."
      wide
    >
      <div className="planning-stack">
        {!!bookings.length && (
          <Disclosure className="saved-bookings">
            <summary>Your saved reservations · {bookings.length}</summary>
            <Field label="Find a reservation">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or booking reference"
              />
            </Field>
            {bookings
              .filter((i) =>
                `${i.title} ${i.reservation?.reference ?? ""} ${i.flight?.bookingReference ?? ""}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((i) => (
                <button
                  className="saved-booking-row"
                  key={i.id}
                  onClick={() => {
                    onClose();
                    onExisting(i);
                  }}
                >
                  <span>
                    <b>{i.title}</b>
                    <small>
                      {i.day ?? "Date to confirm"}
                      {i.endDay ? ` → ${i.endDay}` : ""}
                    </small>
                  </span>
                  <span>
                    {i.lines.length
                      ? money(itemTotal(i), state.currency)
                      : "Add cost"}
                    <ArrowRight size={17} />
                  </span>
                </button>
              ))}
          </Disclosure>
        )}
        <div className="planning-intro">
          <Doodle name="suitcase" />
          <p>
            A confirmation becomes one reservation, with its dates, cost and
            private document in the same place.
          </p>
        </div>
        <Field label="Reservation type">
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectOption value="accommodation">
              Hotel / accommodation
            </SelectOption>
            <SelectOption value="transport">Train / transport</SelectOption>
            <SelectOption value="activity">Activity / experience</SelectOption>
          </Select>
        </Field>
        <label className="planning-upload">
          <UploadSimple size={24} />
          <span>
            Choose a confirmation
            <small>PDF, photo, TXT or plain EML · up to 8 MB</small>
          </span>
          <input
            disabled={busy}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.eml"
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
        <Field label="Or paste the confirmation text">
          <textarea
            rows={8}
            maxLength={100000}
            disabled={busy}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Hotel: A stay to look forward to&#10;Check-in: 2026-10-12 15:00&#10;Check-out: 2026-10-15&#10;Total: EUR 420.00"
          />
        </Field>
        <p className="muted">
          Read on your device. Photos use text recognition; unclear names, dates
          and prices need your review. Original files are uploaded only when you
          save.
        </p>
        {error && <Notice error>{error}</Notice>}
        {busy && <p role="status">{progress || "Preparing your preview…"}</p>}
        <div className="planning-actions">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setFile(undefined);
              setText(
                `Hotel: A stay to look forward to\nCheck-in: ${state.startDate} 15:00\nCheck-out: ${state.endDate}\nBooking reference: EXAMPLE-123\nTotal: ${state.currency} 420.00`,
              );
            }}
          >
            Use sample confirmation
          </Button>
          <Button
            loading={busy}
            disabled={!text.trim()}
            onClick={() => void preview()}
          >
            Review reservation <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </Modal>
  );
}
