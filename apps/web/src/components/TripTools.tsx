import { Select, SelectOption } from "./Select";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  Link as LinkIcon,
  Plus,
  Trash,
  UploadSimple,
  ArrowUpRight,
  LockKey,
} from "@phosphor-icons/react";
import {
  makeId,
  datesLocked,
  tripDays,
  type TripState,
  type Command,
} from "@whereto/shared";
import { api, post } from "../lib/api";
import { Modal, Button, Field, Notice } from "./ui";
import { PackingSuggestions } from "./PlanningEssentials";
import { AnimatePresence, motion } from "motion/react";
import { RollingValue, softSpring, useInstantMotion } from "./motion";
import {
  AvatarStack,
  LiquidToggle,
  TravellerAvatar,
  TravellerEditRow,
} from "./PlayfulControls";
export type Tool =
  | "people"
  | "settings"
  | "checklist"
  | "documents"
  | "share"
  | "export"
  | "history"
  | "trash"
  | null;
export default function TripTools({
  tool,
  onClose,
  state,
  tripId,
  version,
  onCommand,
  demo = false,
  owner = true,
}: {
  tool: Tool;
  onClose: () => void;
  state: TripState;
  tripId: string;
  version: number;
  onCommand: (c: Command) => Promise<void>;
  demo?: boolean;
  owner?: boolean;
}) {
  const instant = useInstantMotion();
  const query = useQueryClient();
  const [participants, setParticipants] = useState(state.participants);
  const [newPersonId, setNewPersonId] = useState<string | null>(null);
  const [recalculate, setRecalculate] = useState(false);
  const [title, setTitle] = useState(state.title),
    [start, setStart] = useState(state.startDate),
    [end, setEnd] = useState(state.endDate),
    [budget, setBudget] = useState(state.budget ?? ""),
    [category, setCategory] = useState(""),
    [newCheck, setNewCheck] = useState(""),
    [checkGroup, setCheckGroup] = useState<"packing" | "before">("before"),
    [shareRole, setShareRole] = useState("viewer"),
    [showBudget, setShowBudget] = useState(false),
    [showStay, setShowStay] = useState(false),
    [shareUrl, setShareUrl] = useState(""),
    [format, setFormat] = useState("pdf"),
    [exportDay, setExportDay] = useState(""),
    [busy, setBusy] = useState(false),
    [docItem, setDocItem] = useState("");
  const documents = useQuery({
    queryKey: ["documents", tripId],
    queryFn: () => api<any[]>(`/trips/${tripId}/documents`),
    enabled: tool === "documents" && !demo,
  });
  const history = useQuery({
    queryKey: ["history", tripId, version],
    queryFn: () => api<any[]>(`/trips/${tripId}/history`),
    enabled: tool === "history" && !demo,
  });
  const shares = useQuery({
    queryKey: ["shares", tripId],
    queryFn: () => api<any[]>(`/trips/${tripId}/shares`),
    enabled: tool === "share" && !demo && owner,
  });
  const members = useQuery({
    queryKey: ["members", tripId],
    queryFn: () => api<any[]>(`/trips/${tripId}/members`),
    enabled: tool === "share" && !demo && owner,
  });
  const jobs = useQuery({
    queryKey: ["jobs", tripId],
    queryFn: () => api<any[]>(`/trips/${tripId}/jobs`),
    enabled: tool === "export" && !demo,
    refetchInterval: 3000,
  });
  if (!tool) return null;
  const titleMap: Record<Exclude<Tool, null>, string> = {
    people: "Your travel people.",
    settings: "Your trip settings.",
    checklist: "Before you head off.",
    documents: "Keep the essentials close.",
    share: "Good trips are better shared.",
    export: "Take your plan with you.",
    history: "Your trip history.",
    trash: "Nothing lost just yet.",
  };
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
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
      title={titleMap[tool]}
      wide={tool === "documents"}
    >
      <div className="trip-tools">
        {tool === "people" && (
          <>
            <p className="muted">
              Name your fellow wanderers. Shared costs can include everyone or
              just a few people.
            </p>
            <div className="travel-group-preview">
              <AvatarStack people={participants} />
              <span>
                <RollingValue>{participants.length}</RollingValue> travellers
              </span>
            </div>
            <AnimatePresence initial={false}>
              {participants.map((p, i) => (
                <TravellerEditRow
                  key={p.id}
                  className="participant-edit"
                  layout={instant ? false : "position"}
                  initial={
                    instant
                      ? false
                      : { opacity: 0, transform: "translateY(8px) scale(.98)" }
                  }
                  animate={{ opacity: 1, transform: "translateY(0) scale(1)" }}
                  exit={{ opacity: 0, transform: "translateX(8px) scale(.98)" }}
                  transition={instant ? { duration: 0 } : softSpring}
                >
                  <TravellerAvatar person={p} />
                  <input
                    autoFocus={newPersonId === p.id}
                    aria-label={`Traveller ${i + 1} name`}
                    value={p.name}
                    onChange={(e) =>
                      setParticipants(
                        participants.map((person) =>
                          person.id === p.id
                            ? { ...person, name: e.target.value }
                            : person,
                        ),
                      )
                    }
                  />
                  {i > 0 && (
                    <button
                      className="icon-button"
                      aria-label={`Remove ${p.name}`}
                      onClick={() =>
                        setParticipants(
                          participants.filter((person) => person.id !== p.id),
                        )
                      }
                    >
                      <Trash size={18} />
                    </button>
                  )}
                </TravellerEditRow>
              ))}
            </AnimatePresence>
            <Button
              variant="secondary"
              onClick={() => {
                const id = makeId();
                setNewPersonId(id);
                setParticipants([
                  ...participants,
                  {
                    id,
                    name: `Traveller ${participants.length + 1}`,
                  },
                ]);
              }}
            >
              <Plus size={18} /> Add a traveller
            </Button>
            <LiquidToggle
              checked={recalculate}
              onChange={(e) => setRecalculate(e.target.checked)}
            >
              Recalculate unconfirmed, per-person group estimates. Booked costs
              stay unchanged.
            </LiquidToggle>
            <Button
              className="full-width"
              loading={busy}
              onClick={() =>
                void action(async () => {
                  await onCommand({
                    type: "participants",
                    participants,
                    recalculate,
                  });
                  onClose();
                })
              }
            >
              Save your people
            </Button>
          </>
        )}
        {tool === "settings" && (
          <>
            <Field label="Trip name">
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Notice>
              <LockKey size={18} />
              {state.destinations.map((d) => d.name).join(" · ")} — destinations
              are fixed.
            </Notice>
            <div className="form-grid">
              <Field label="Departure">
                <input
                  type="date"
                  disabled={datesLocked(state)}
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Return">
                <input
                  type="date"
                  disabled={datesLocked(state)}
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            {datesLocked(state) && (
              <small className="muted">
                This trip has started, so its dates are now fixed.
              </small>
            )}
            <Field label={`Group budget (${state.currency})`}>
              <input
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </Field>
            <Field label="Your starting view">
              <Select
                value={state.modules}
                onValueChange={(nextValue) =>
                  void onCommand({
                    type: "settings",
                    patch: { modules: nextValue as any },
                  })
                }
              >
                <SelectOption value="both">Itinerary and budget</SelectOption>
                <SelectOption value="itinerary">Itinerary first</SelectOption>
                <SelectOption value="budget">Budget first</SelectOption>
              </Select>
            </Field>
            <Field label="Add a budget category">
              <div className="input-action">
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Travel insurance"
                />
                <Button
                  variant="secondary"
                  disabled={!category.trim()}
                  onClick={() =>
                    void action(async () => {
                      await onCommand({
                        type: "settings",
                        patch: {
                          categories: [
                            ...new Set([...state.categories, category.trim()]),
                          ],
                        },
                      });
                      setCategory("");
                    })
                  }
                >
                  <Plus size={18} />
                </Button>
              </div>
            </Field>
            <div className="destination-chips">
              {state.categories.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button
              loading={busy}
              className="full-width"
              onClick={() =>
                void action(async () => {
                  await onCommand({
                    type: "settings",
                    patch: {
                      title,
                      startDate: start,
                      endDate: end,
                      budget: budget || null,
                    },
                  });
                  onClose();
                })
              }
            >
              Save the details
            </Button>
          </>
        )}
        {tool === "checklist" && (
          <>
            <p className="muted">Everything you need, ready to go.</p>
            <div className="checklist-progress" role="status">
              <span>
                <RollingValue>
                  {state.checklist.filter((c) => c.done).length}
                </RollingValue>{" "}
                of {state.checklist.length} ready to go
              </span>
              <div className="checklist-progress-track" aria-hidden="true">
                <span
                  style={{
                    transform: `scaleX(${state.checklist.length ? state.checklist.filter((c) => c.done).length / state.checklist.length : 0})`,
                  }}
                />
              </div>
            </div>
            <PackingSuggestions state={state} onCommand={onCommand} />
            {(["before", "packing"] as const).map((group) => (
              <div className="checklist-group" key={group}>
                <h3>{group === "before" ? "Before you go" : "In your bag"}</h3>
                <AnimatePresence initial={false} mode="popLayout">
                  {state.checklist
                    .filter((c) => c.group === group)
                    .map((c) => (
                      <motion.div
                        className="checklist-row"
                        key={c.id}
                        layout={instant ? false : "position"}
                        initial={instant ? false : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{
                          opacity: 0,
                          x: instant ? 0 : 8,
                          transition: { duration: instant ? 0 : 0.15 },
                        }}
                        transition={instant ? { duration: 0 } : softSpring}
                      >
                        <label
                          className={`checkbox-label ${c.done ? "done" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={c.done}
                            onChange={() =>
                              void onCommand({
                                type: "checklist",
                                checklist: state.checklist.map((row) =>
                                  row.id === c.id
                                    ? { ...row, done: !row.done }
                                    : row,
                                ),
                              })
                            }
                          />
                          <span className="checklist-text">{c.text}</span>
                        </label>
                        <button
                          className="icon-button"
                          aria-label={`Remove ${c.text}`}
                          onClick={() =>
                            void onCommand({
                              type: "checklist",
                              checklist: state.checklist.filter(
                                (row) => row.id !== c.id,
                              ),
                            })
                          }
                        >
                          <Trash size={16} />
                        </button>
                      </motion.div>
                    ))}
                </AnimatePresence>
              </div>
            ))}
            <Field label="Add a checklist item">
              <input
                value={newCheck}
                onChange={(e) => setNewCheck(e.target.value)}
                placeholder="Passport, charger, comfy shoes…"
              />
            </Field>
            <div className="input-action">
              <Select
                aria-label="Checklist group"
                value={checkGroup}
                onValueChange={(nextValue) => setCheckGroup(nextValue as any)}
              >
                <SelectOption value="before">Before you go</SelectOption>
                <SelectOption value="packing">In your bag</SelectOption>
              </Select>
              <Button
                disabled={!newCheck.trim()}
                onClick={() =>
                  void action(async () => {
                    await onCommand({
                      type: "checklist",
                      checklist: [
                        ...state.checklist,
                        {
                          id: makeId(),
                          text: newCheck.trim(),
                          done: false,
                          group: checkGroup,
                        },
                      ],
                    });
                    setNewCheck("");
                  })
                }
              >
                <Plus size={18} /> Add
              </Button>
            </div>
          </>
        )}
        {tool === "documents" && (
          <>
            <p className="muted">
              Tickets, confirmations and the essentials. Private to trip
              members; never included in public share links.
            </p>
            <Notice>
              PDF, PNG, JPEG or WebP · up to 10 MB per file · 100 MB per trip.
            </Notice>
            <Field label="Attach to a booking (optional)">
              <Select
                value={docItem}
                onValueChange={(nextValue) => setDocItem(nextValue)}
              >
                <SelectOption value="">Whole trip</SelectOption>
                {state.items
                  .filter((i) => !i.deletedAt)
                  .map((i) => (
                    <SelectOption value={i.id} key={i.id}>
                      {i.title}
                    </SelectOption>
                  ))}
              </Select>
            </Field>
            <label className="upload-zone">
              <UploadSimple size={28} />
              <strong>Choose a file to keep close</strong>
              <input
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (demo) {
                    toast.info(
                      "File uploads are available in your own trip. Demo files are not sent anywhere.",
                    );
                    return;
                  }
                  void action(async () => {
                    const data = new FormData();
                    data.append("file", file);
                    if (docItem) data.append("itemId", docItem);
                    await api(`/trips/${tripId}/documents`, {
                      method: "POST",
                      body: data,
                    });
                    await query.invalidateQueries({
                      queryKey: ["documents", tripId],
                    });
                    toast.success("Safely tucked away.");
                  });
                }}
              />
            </label>
            {documents.data?.map((doc) => (
              <div className="document-row" key={doc.id}>
                <div>
                  <strong>{doc.name}</strong>
                  <small>
                    {Math.round(doc.size / 1024)} KB{" "}
                    {doc.itemId
                      ? "· " +
                        state.items.find((i) => i.id === doc.itemId)?.title
                      : ""}
                  </small>
                </div>
                <a
                  className="icon-button"
                  aria-label={`Download ${doc.name} for offline access`}
                  href={`/api/v1/documents/${doc.id}/download`}
                >
                  <Download size={20} />
                </a>
                <button
                  className="icon-button"
                  aria-label={`Delete ${doc.name}`}
                  onClick={() =>
                    void action(async () => {
                      await api(`/documents/${doc.id}`, { method: "DELETE" });
                      await query.invalidateQueries({
                        queryKey: ["documents", tripId],
                      });
                    })
                  }
                >
                  <Trash size={18} />
                </button>
              </div>
            ))}
            {documents.error && (
              <Notice error>{documents.error.message}</Notice>
            )}
          </>
        )}
        {tool === "share" && (
          <>
            {!owner ? (
              <Notice>
                Only the trip owner can create or revoke sharing links.
              </Notice>
            ) : (
              <>
                <p className="muted">
                  Share inspiration, or invite someone to plan with you.
                </p>
                <Field label="Link access">
                  <Select
                    value={shareRole}
                    onValueChange={(nextValue) => setShareRole(nextValue)}
                  >
                    <SelectOption value="viewer">
                      Public, read-only trip view
                    </SelectOption>
                    <SelectOption value="editor">
                      Invite an editor — sign-in required
                    </SelectOption>
                  </Select>
                </Field>
                {shareRole === "viewer" && (
                  <>
                    <LiquidToggle
                      checked={showBudget}
                      onChange={(e) => setShowBudget(e.target.checked)}
                    >
                      Include planned budget
                    </LiquidToggle>
                    <LiquidToggle
                      checked={showStay}
                      onChange={(e) => setShowStay(e.target.checked)}
                    >
                      Include accommodation locations
                    </LiquidToggle>
                    <small className="muted">
                      Private notes, payments, traveller names and documents are
                      always hidden.
                    </small>
                  </>
                )}
                <Button
                  loading={busy}
                  onClick={() =>
                    void action(async () => {
                      if (demo) {
                        toast.info(
                          "Create your own trip to share it with friends.",
                        );
                        return;
                      }
                      const r = await post(`/trips/${tripId}/shares`, {
                        role: shareRole,
                        showBudget,
                        showAccommodation: showStay,
                      });
                      setShareUrl(r.url);
                      await query.invalidateQueries({
                        queryKey: ["shares", tripId],
                      });
                    })
                  }
                >
                  <LinkIcon size={18} /> Create a link
                </Button>
                {shareUrl && (
                  <div className="copy-link">
                    <input aria-label="Share link" readOnly value={shareUrl} />
                    <button
                      className="icon-button"
                      aria-label="Copy share link"
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(shareUrl)
                          .then(() => toast.success("Link copied."))
                      }
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                )}
                {!!members.data?.length && (
                  <div>
                    <h3>People with editing access</h3>
                    {members.data.map((member) => (
                      <div className="share-row" key={member.userId}>
                        <span>{member.user.name}</span>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void action(async () => {
                              await api(
                                `/trips/${tripId}/members/${member.userId}`,
                                { method: "DELETE" },
                              );
                              await query.invalidateQueries({
                                queryKey: ["members", tripId],
                              });
                            })
                          }
                        >
                          Remove access
                        </Button>
                      </div>
                    ))}
                    <small>
                      Revoke invitation links as well to prevent joining again.
                    </small>
                  </div>
                )}
                {shares.data?.map((link) => (
                  <div className="share-row" key={link.id}>
                    <span>
                      {link.role === "editor"
                        ? "Editor invitation"
                        : "Read-only link"}
                      <small>
                        Created {new Date(link.createdAt).toLocaleDateString()}
                      </small>
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void action(async () => {
                          await api(`/trips/${tripId}/shares/${link.id}`, {
                            method: "DELETE",
                          });
                          await query.invalidateQueries({
                            queryKey: ["shares", tripId],
                          });
                          toast.success("Link revoked.");
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
        {tool === "export" && (
          <>
            <p className="muted">
              A numbered map and a clear list of stops, for one day or your
              whole adventure.
            </p>
            <div className="form-grid">
              <Field label="What to take">
                <Select
                  value={exportDay}
                  onValueChange={(nextValue) => setExportDay(nextValue)}
                >
                  <SelectOption value="">The whole trip</SelectOption>
                  {tripDays(state).map((d) => (
                    <SelectOption key={d}>{d}</SelectOption>
                  ))}
                </Select>
              </Field>
              <Field label="Format">
                <Select
                  value={format}
                  onValueChange={(nextValue) => setFormat(nextValue)}
                >
                  <SelectOption value="pdf">PDF · map & itinerary</SelectOption>
                  <SelectOption value="png">PNG · map image</SelectOption>
                </Select>
              </Field>
            </div>
            <LiquidToggle
              checked={showBudget}
              onChange={(e) => setShowBudget(e.target.checked)}
            >
              Include planned costs
            </LiquidToggle>
            <LiquidToggle
              checked={showStay}
              onChange={(e) => setShowStay(e.target.checked)}
            >
              Include accommodation
            </LiquidToggle>
            <Button
              loading={busy}
              onClick={() =>
                void action(async () => {
                  if (demo) {
                    toast.info(
                      "Real map exports are available from your own trip when map services are connected.",
                    );
                    return;
                  }
                  await post(`/trips/${tripId}/exports`, {
                    format,
                    day: exportDay || undefined,
                    showBudget,
                    showAccommodation: showStay,
                  });
                  await query.invalidateQueries({ queryKey: ["jobs", tripId] });
                  toast.success("Your map is being prepared.");
                })
              }
            >
              <Download size={19} /> Prepare my export
            </Button>
            <Button variant="ghost" onClick={() => window.print()}>
              Print the current itinerary
            </Button>
            {jobs.data
              ?.filter((j) => j.type === "export")
              .map((job) => (
                <div className="job-row" key={job.id}>
                  <span>
                    <strong>
                      {job.status === "completed"
                        ? "Ready to go"
                        : job.status === "failed"
                          ? "Could not prepare the map"
                          : "Preparing your map…"}
                    </strong>
                    {job.error && <small role="alert">{job.error}</small>}
                  </span>
                  {job.status === "completed" && (
                    <a
                      href={`/api/v1/jobs/${job.id}/download`}
                      className="button button-secondary"
                    >
                      <Download size={18} /> Download
                    </a>
                  )}
                </div>
              ))}
          </>
        )}
        {tool === "history" && (
          <>
            {demo ? (
              <Notice>
                Changes in this demo stay on this device. Your own trips keep a
                shared change history.
              </Notice>
            ) : (
              history.data?.map((row) => (
                <div className="history-row" key={row.id}>
                  <span className="avatar">{row.actor[0]}</span>
                  <div>
                    <strong>{row.actor}</strong>
                    <p>
                      {(
                        {
                          "item.save": "Updated a plan or expense",
                          "item.order": "Rearranged a day",
                          "item.delete": "Moved an item to recently deleted",
                          "item.restore": "Restored an item",
                          settings: "Updated trip details",
                          participants: "Updated the travel group",
                          comment: "Left a comment",
                          settlement: "Recorded a settlement",
                          checklist: "Updated the checklist",
                          "poll.create": "Opened a group vote",
                          "poll.vote": "Updated a vote",
                          "poll.resolve": "Added the chosen idea to the plan",
                          "poll.cancel": "Closed a group vote",
                          "receipt.save": "Updated a meal from its receipt",
                          "reservation.import":
                            "Imported a reservation and its document",
                        } as Record<string, string>
                      )[row.action] ?? row.action}
                    </p>
                    <small>{new Date(row.createdAt).toLocaleString()}</small>
                  </div>
                </div>
              ))
            )}
          </>
        )}
        {tool === "trash" && (
          <>
            <p className="muted">
              Deleted items stay here so you can bring them back. They don’t
              count towards your budget.
            </p>
            {state.items
              .filter((i) => i.deletedAt)
              .map((item) => (
                <div className="document-row" key={item.id}>
                  <span>{item.title}</span>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void onCommand({ type: "item.restore", id: item.id })
                    }
                  >
                    Restore
                  </Button>
                </div>
              ))}
            {!state.items.some((i) => i.deletedAt) && (
              <p className="empty">
                Nothing here. Your plans are all accounted for.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
