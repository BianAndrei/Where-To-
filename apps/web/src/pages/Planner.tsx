import { Select, SelectOption } from "../components/Select";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import {
  MotionChoice,
  MotionGroup,
  MotionPanel,
  RollingValue,
  softSpring,
  useInstantMotion,
  useSurfaceTransition,
  Disclosure,
} from "../components/motion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Plus,
  CalendarBlank,
  Wallet,
  MapTrifold,
  Lightbulb,
  Users,
  CheckSquare,
  Files,
  ShareNetwork,
  DownloadSimple,
  GearSix,
  DotsSixVertical,
  Trash,
  ArrowUp,
  ArrowDown,
  LockKey,
  Clock,
  Check,
  SpinnerGap,
  House,
  ChatCircle,
  PaperPlaneTilt,
  ClockCounterClockwise,
  Sun,
  WifiSlash,
  Globe,
  Train,
  SquaresFour,
  SidebarSimple,
  UploadSimple,
  Receipt,
  UsersThree,
} from "@phosphor-icons/react";
import {
  applyCommand,
  budgetSummary,
  tripDays,
  orderedItems,
  newItem,
  itemTotal,
  money,
  scheduleWarnings,
  suggestOrder,
  localDate,
  todayPlan,
  type TripRecord,
  type TripItem,
  type Command,
  type MissingPiece,
  type TransferNeed,
} from "@whereto/shared";
import { api, post, ApiError } from "../lib/api";
import { makeDemo, refreshDemoCopy } from "../lib/demo";
import { Logo, Doodle } from "../components/Doodle";
import { Button, Notice, Modal, Field } from "../components/ui";
import ItemEditor from "../components/ItemEditor";
import QuickAdd from "../components/QuickAdd";
import RadialAdd from "../components/RadialAdd";
import TripSearch from "../components/TripSearch";
import GuidedHelp from "../components/GuidedHelp";
import { usePreferences } from "../lib/preferences";
import AppSidebar2 from "../components/react-bits/AppSidebar2";
import BudgetView from "../components/BudgetView";
import TripTools, { type Tool } from "../components/TripTools";
import MenuPanel from "../components/MenuPanel";
import { LocationPicker } from "../components/LocationPicker";
import CompareOptions from "../components/CompareOptions";
import TodayFocus from "../components/TodayFocus";
import FlightTimeline from "../components/FlightTimeline";
import { PlanningEssentials } from "../components/PlanningEssentials";
import type { SaveImport } from "../components/PlanningImport";
const PlanningImport = lazy(() => import("../components/PlanningImport"));
const ReceiptImport = lazy(() => import("../components/ReceiptImport"));
const GroupPolls = lazy(() => import("../components/GroupPolls"));
const TransferPlanner = lazy(() => import("../components/TransferPlanner"));
const MapView = lazy(() => import("../components/MapView"));
type View = "itinerary" | "budget" | "ideas" | "today";
function ItemRow({
  item,
  displayDay,
  index,
  currency,
  onEdit,
  onDelete,
  onMove,
  onMenu,
  readOnly = false,
}: {
  item: TripItem;
  displayDay: string;
  index: number;
  currency: string;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onMenu: () => void;
  readOnly?: boolean;
}) {
  const instant = useInstantMotion();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    disabled: readOnly,
    // Motion owns reflow after insertion/removal/reorder; dnd-kit owns dragging.
    animateLayoutChanges: () => false,
    transition: {
      duration: instant ? 0 : 280,
      easing: "cubic-bezier(.22,1,.36,1)",
    },
  });
  const icon =
    item.kind === "accommodation"
      ? "suitcase"
      : item.kind === "restaurant"
        ? "meal"
        : item.kind === "transport"
          ? "train"
          : item.kind === "flight"
            ? "plane"
            : "pin";
  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.92 : 1,
      }}
      className={`itinerary-item kind-${item.kind}`}
      data-dragging={isDragging}
    >
      <div className="item-time">
        <strong>
          {item.flight && displayDay !== item.day
            ? "Continues"
            : (item.time ?? "Any time")}
        </strong>
        <small>{item.duration ? `${item.duration} min` : ""}</small>
      </div>
      <div className="timeline-node">
        <span>{index + 1}</span>
        <i />
      </div>
      <div className="item-card">
        <button className="item-main" onClick={onEdit}>
          <span className="item-doodle">
            <Doodle name={icon} />
          </span>
          <span className="item-details">
            <span className="item-tags">
              <small>
                {item.kind === "accommodation"
                  ? "YOUR HOME BASE"
                  : item.category.toUpperCase()}
              </small>
              {item.fixed && <LockKey size={12} />}
            </span>
            <strong>{item.title}</strong>
            <span className="item-secondary">
              {item.location?.name ?? "Add a place or a note"}
              {item.state === "booked" && (
                <span className="booked-label">
                  <Check size={12} /> Booked
                </span>
              )}
            </span>
          </span>
          <span className="item-cost">
            {item.lines.length ? money(itemTotal(item), currency) : "Add cost"}
            <small>
              {item.flight
                ? displayDay !== item.day
                  ? `counted on ${item.day}`
                  : "whole booking"
                : "for the group"}
            </small>
          </span>
        </button>
        {item.kind === "flight" && item.flight && (
          <FlightTimeline flight={item.flight} compact />
        )}
        <div className="item-card-bottom">
          <span>
            {item.notes
              ? item.notes.slice(0, 65)
              : item.kind === "restaurant"
                ? "A good day starts with good food."
                : item.bookingUrl
                  ? "Booking link saved"
                  : "Part of your day."}
          </span>
          <div>
            {item.kind === "restaurant" && !readOnly && (
              <button className="plain-link" onClick={onMenu}>
                View menu <ArrowUpRight size={13} />
              </button>
            )}
            {item.bookingUrl && (
              <a
                href={item.bookingUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${item.title} booking`}
              >
                <ArrowUpRight size={17} />
              </a>
            )}
            {!readOnly && (
              <>
                <button
                  className="icon-button tiny"
                  onClick={() => onMove(-1)}
                  aria-label={`Move ${item.title} earlier`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button tiny"
                  onClick={() => onMove(1)}
                  aria-label={`Move ${item.title} later`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="icon-button tiny"
                  aria-label={`Delete ${item.title}`}
                  onClick={onDelete}
                >
                  <Trash size={14} />
                </button>
                <button
                  className="drag-handle"
                  aria-label={`Reorder ${item.title}`}
                  {...attributes}
                  {...listeners}
                >
                  <DotsSixVertical size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
export default function Planner({
  demo = false,
  shared,
}: {
  demo?: boolean;
  shared?: TripRecord & {
    public?: boolean;
    showBudget?: boolean;
    token?: string;
  };
}) {
  const instant = useInstantMotion();
  const changeSurface = useSurfaceTransition();
  const preferences = usePreferences();
  const navigate = useNavigate();
  const { id } = useParams();
  const [params] = useSearchParams();
  const query = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/me"),
    enabled: !demo && !shared,
  });
  const [planningTool, setPlanningTool] = useState<
    "import" | "receipt" | "polls" | "transfers" | null
  >(null);
  const [transferNeed, setTransferNeed] = useState<TransferNeed>();
  const [editorTab, setEditorTab] = useState<"details" | "costs" | "payments">(
    "details",
  );
  const [demoRecord, setDemoRecord] = useState(() => {
    try {
      return refreshDemoCopy(
        (JSON.parse(
          localStorage.getItem("whereto-demo") ?? "null",
        ) as TripRecord) ?? makeDemo(),
      );
    } catch {
      return makeDemo();
    }
  });
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const trip = useQuery({
    queryKey: ["trip", id],
    queryFn: () => api<TripRecord>(`/trips/${id}`),
    enabled: !demo && !shared && !!id && !offline,
    refetchInterval: 5000,
  });
  let offlineRecord: TripRecord | undefined;
  try {
    const cached = JSON.parse(
      localStorage.getItem("whereto-offline") ?? "null",
    );
    if (cached?.id === id) offlineRecord = cached;
  } catch {}
  const record =
    shared ??
    (demo ? demoRecord : (trip.data ?? (offline ? offlineRecord : undefined)));
  useEffect(() => {
    if (trip.data && !shared)
      localStorage.setItem("whereto-offline", JSON.stringify(trip.data));
  }, [trip.data, shared]);
  const [view, setView] = useState<View>(
    params.get("view") === "budget"
      ? "budget"
      : params.get("view") === "itinerary"
        ? "itinerary"
        : preferences.defaultView,
  );
  const [compactNav, setCompactNav] = useState(() => {
    try {
      const saved = localStorage.getItem("whereto-nav-compact");
      return saved === null ? preferences.compactNav : saved === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("whereto-nav-compact", String(compactNav));
    } catch {
      /* Navigation still works when device storage is unavailable. */
    }
  }, [compactNav]);
  useEffect(() => {
    const sync = () => {
      try {
        setCompactNav(localStorage.getItem("whereto-nav-compact") === "true");
      } catch {
        setCompactNav(preferences.compactNav);
      }
    };
    window.addEventListener("whereto-navigation", sync);
    return () => window.removeEventListener("whereto-navigation", sync);
  }, [preferences.compactNav]);
  const toggleNav = () =>
    changeSurface(() => setCompactNav((compact) => !compact));
  const mobileToolsDropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const dropdown = mobileToolsDropdown.current;
      if (event.target instanceof Node && !dropdown?.contains(event.target))
        dropdown && (dropdown.open = false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);
  const [day, setDay] = useState(""),
    [tool, setTool] = useState<Tool>(null),
    [editing, setEditing] = useState<TripItem | null>(null),
    [quickAdding, setQuickAdding] = useState<TripItem | null>(null),
    [menuItem, setMenuItem] = useState<TripItem | null>(null),
    [activeId, setActiveId] = useState<string>(),
    [mobileMap, setMobileMap] = useState(false),
    [saving, setSaving] = useState(false),
    [proposal, setProposal] = useState<string[] | null>(null),
    [undoOrder, setUndoOrder] = useState<string[] | null>(null),
    [discovery, setDiscovery] = useState(false),
    [transitOpen, setTransitOpen] = useState(false),
    [compareOpen, setCompareOpen] = useState(false),
    [commentItem, setCommentItem] = useState(""),
    [commentText, setCommentText] = useState(""),
    [commentsOpen, setCommentsOpen] = useState(false);
  const [travel, setTravel] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    if (view !== "today") return;
    const tick = () => setClock(new Date());
    tick();
    const timer = window.setInterval(tick, 30000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [view]);
  const todayInfo = useMemo(
    () => (view === "today" && record ? todayPlan(record.state, clock) : null),
    [view, record?.state, clock],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  useEffect(() => {
    if (record && !day) setDay(record.state.startDate);
    if (record?.state.modules === "budget" && !params.get("view"))
      setView("budget");
  }, [record?.id]);
  useEffect(() => {
    if (
      !demo &&
      !shared &&
      record &&
      !params.get("view") &&
      me.data?.preferences
    )
      setView(
        record.state.modules === "budget"
          ? "budget"
          : me.data.preferences.defaultView,
      );
  }, [record?.id, me.data?.preferences?.defaultView]);
  if (
    !demo &&
    !shared &&
    trip.error instanceof ApiError &&
    [401, 403].includes(trip.error.status)
  )
    return <Navigate to="/login" />;
  if (!record)
    return (
      <div className="page-loading">
        {trip.error ? (
          <>
            <p>{trip.error.message}</p>
            <Link to="/app">Back to your trips</Link>
          </>
        ) : offline ? (
          "Open a saved trip while online once to keep it available offline."
        ) : (
          "Opening your trip…"
        )}
      </div>
    );
  const state = record.state;
  const readOnly = record.role === "viewer" || (offline && !demo);
  const selectedDay = day || state.startDate;
  const days = tripDays(state);
  const items = orderedItems(state, selectedDay);
  const summary = budgetSummary(state);
  const ideaItems = state.items.filter(
    (i) => !i.deletedAt && i.state === "idea",
  );
  const warnings = scheduleWarnings(items, travel);
  const today = todayInfo?.day ?? localDate(state.destinations[0]!.timezone);
  const todayItems = todayInfo?.items ?? [];
  const shownItems =
    view === "ideas" ? ideaItems : view === "today" ? todayItems : items;
  async function run(command: Command) {
    if (!record || readOnly) return;
    setSaving(true);
    try {
      if (demo) {
        const next = {
          ...record,
          version: record.version + 1,
          state: applyCommand(record.state, command, "You", new Date(), {
            actorId: "demo-organizer",
            owner: true,
          }),
        };
        setDemoRecord(next);
        localStorage.setItem("whereto-demo", JSON.stringify(next));
        return;
      }
      const updated = await post<TripRecord>(`/trips/${record.id}/commands`, {
        version: record.version,
        command,
      });
      query.setQueryData(["trip", id], updated);
      await query.invalidateQueries({ queryKey: ["trips"] });
    } catch (e) {
      toast.error((e as Error).message);
      if (e instanceof ApiError && e.status === 409)
        await query.invalidateQueries({ queryKey: ["trip", id] });
      throw e;
    } finally {
      setSaving(false);
    }
  }
  const safeRun = (command: Command) => run(command).catch(() => {});
  const saveImport: SaveImport = async (command, source) => {
    if (readOnly) throw new Error("This trip is read only.");
    if (demo) {
      await run(command);
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append(
        "payload",
        JSON.stringify({ version: record.version, command, text: source.text }),
      );
      if (source.file) body.append("file", source.file);
      const updated = await api<TripRecord>(
        `/trips/${record.id}/planning/import`,
        { method: "POST", body },
      );
      query.setQueryData(["trip", id], updated);
      await Promise.all([
        query.invalidateQueries({ queryKey: ["documents", record.id] }),
        query.invalidateQueries({ queryKey: ["trips"] }),
      ]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409)
        await query.invalidateQueries({ queryKey: ["trip", id] });
      throw e;
    } finally {
      setSaving(false);
    }
  };
  function fixMissing(piece: MissingPiece) {
    if (piece.action === "transfer") {
      setTransferNeed(piece.transfer);
      setPlanningTool("transfers");
      return;
    }
    if (piece.itemId) {
      setEditorTab(piece.action === "payment" ? "payments" : "costs");
      setEditing(state.items.find((i) => i.id === piece.itemId) ?? null);
      return;
    }
    const item = newItem(state, piece.day);
    item.kind = "accommodation";
    item.category = "Accommodation";
    item.endDay = new Date(Date.parse(piece.day) + 86400000)
      .toISOString()
      .slice(0, 10);
    setDay(piece.day);
    setView("itinerary");
    setEditing(item);
  }
  function add(kind: TripItem["kind"] = "activity") {
    const item = newItem(
      state,
      view === "ideas"
        ? null
        : view === "today" && today >= state.startDate && today <= state.endDate
          ? today
          : selectedDay,
    );
    item.kind = kind;
    if (view === "ideas") item.state = "idea";
    item.category = {
      activity: "Activities",
      restaurant: "Food & drinks",
      accommodation: "Accommodation",
      transport: "Transport",
      flight: "Transport",
      shopping: "Shopping",
      other: "Other",
    }[kind];
    item.duration = 0;
    if (kind === "activity" || kind === "other") setQuickAdding(item);
    else setEditing(item);
  }
  async function reorder(ids: string[]) {
    await run({ type: "item.order", day: selectedDay, ids });
  }
  function move(item: TripItem, delta: number) {
    const ids = items.map((i) => i.id);
    const index = ids.indexOf(item.id),
      next = index + delta;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next]!, ids[index]!];
    void reorder(ids).catch(() => {});
  }
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(String(e.active.id)),
      to = ids.indexOf(String(e.over.id));
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved!);
    void reorder(ids).catch(() => {});
  }
  async function suggest() {
    const stay = state.items.find(
      (i) =>
        !i.deletedAt &&
        i.state !== "idea" &&
        i.kind === "accommodation" &&
        i.day &&
        i.day <= selectedDay &&
        (!i.endDay || i.endDay >= selectedDay),
    );
    if (demo)
      setProposal(suggestOrder(items, stay?.location ?? state.destinations[0]));
    else
      try {
        const result = await post(`/trips/${record!.id}/suggest-order`, {
          day: selectedDay,
        });
        setProposal(result.ids);
      } catch (e) {
        toast.error((e as Error).message);
      }
  }
  async function checkTravel() {
    if (demo) {
      toast.info(
        "The demo does not request live route times. Add your own trip to calculate them.",
      );
      return;
    }
    try {
      const next: Record<string, number> = {};
      for (let i = 1; i < items.length; i++) {
        const a = items[i - 1]!,
          b = items[i]!;
        const from = a.endLocation ?? a.location;
        if (!from || !b.location) continue;
        const result = await post("/routes", {
          a: from,
          b: b.location,
          mode: "walk",
        });
        next[`${a.id}:${b.id}`] = result.minutes;
      }
      setTravel(next);
      toast.success("Walking times checked.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div
      className={`planner ${compactNav ? "nav-compact" : ""} ${shared?.public && !shared.showBudget ? "public-no-budget" : ""} ${transitOpen ? "transit-open" : ""}`}
    >
      <aside className="planner-sidebar">
        <div className="sidebar-header">
          <Link to={demo ? "/" : "/app"} aria-label="Whereto home">
            <Logo small />
          </Link>
          <button
            type="button"
            className="nav-density-toggle"
            onClick={toggleNav}
            aria-label={compactNav ? "Expand navigation" : "Compact navigation"}
            aria-pressed={compactNav}
            title={compactNav ? "Expand navigation" : "Compact navigation"}
          >
            <SidebarSimple
              size={20}
              weight={compactNav ? "fill" : "regular"}
              aria-hidden="true"
            />
          </button>
        </div>
        <Link
          to={demo ? "/" : "/app"}
          className="sidebar-back"
          aria-label={demo ? "Back to Whereto" : "All your trips"}
          title={
            compactNav
              ? demo
                ? "Back to Whereto"
                : "All your trips"
              : undefined
          }
        >
          <ArrowLeft size={15} />
          <span>{demo ? "Back to Whereto" : "All your trips"}</span>
        </Link>
        <div className="sidebar-trip">
          <Doodle name="map" colour="#CDE5D4" />
          <strong>{state.destinations.map((p) => p.name).join(" & ")}</strong>
          <small>
            {new Date(state.startDate + "T12:00").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}{" "}
            —{" "}
            {new Date(state.endDate + "T12:00").toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}
          </small>
        </div>
        <nav aria-label="Trip views">
          <MotionGroup>
            {(
              [
                ["itinerary", "Itinerary", CalendarBlank],
                ["budget", "Budget", Wallet],
                ["ideas", "Ideas", Lightbulb],
                ["today", "Today", Sun],
              ] as const
            )
              .filter(
                ([v]) =>
                  !shared?.public ||
                  (v !== "ideas" &&
                    v !== "today" &&
                    (v !== "budget" || shared.showBudget)),
              )
              .map(([v, label, Icon]) => (
                <MotionChoice
                  key={v}
                  active={view === v}
                  aria-label={label}
                  title={compactNav ? label : undefined}
                  onClick={() => setView(v)}
                >
                  <Icon size={21} />
                  <span className="nav-label">{label}</span>
                  {v === "ideas" && ideaItems.length > 0 && (
                    <span className="nav-count">{ideaItems.length}</span>
                  )}
                </MotionChoice>
              ))}
          </MotionGroup>
        </nav>
        {!shared?.public &&
          (compactNav ? (
            <AppSidebar2
              groups={[
                {
                  label: "People & essentials",
                  icon: <Users size={21} aria-hidden="true" />,
                  items: [
                    {
                      label: "Your people",
                      icon: <Users size={19} />,
                      onSelect: () => setTool("people"),
                    },
                    {
                      label: "Checklist",
                      icon: <CheckSquare size={19} />,
                      onSelect: () => setTool("checklist"),
                    },
                    {
                      label: "Documents",
                      icon: <Files size={19} />,
                      onSelect: () => setTool("documents"),
                    },
                    {
                      label: "Trains",
                      icon: <Train size={19} />,
                      onSelect: () => setTransitOpen(true),
                    },
                  ],
                },
                {
                  label: "Manage trip",
                  icon: <GearSix size={21} aria-hidden="true" />,
                  items: [
                    {
                      label: "History",
                      icon: <ClockCounterClockwise size={19} />,
                      onSelect: () => setTool("history"),
                    },
                    {
                      label: "Recently deleted",
                      icon: <Trash size={19} />,
                      onSelect: () => setTool("trash"),
                    },
                    {
                      label: "Trip settings",
                      icon: <GearSix size={19} />,
                      onSelect: () => setTool("settings"),
                    },
                  ],
                },
              ]}
            />
          ) : (
            <>
              <span className="sidebar-label">YOUR TRIP TOOLS</span>
              <nav aria-label="Trip tools">
                {(
                  [
                    ["people", "Your people", Users],
                    ["checklist", "Checklist", CheckSquare],
                    ["documents", "Documents", Files],
                    ["history", "History", ClockCounterClockwise],
                    ["trash", "Recently deleted", Trash],
                  ] as const
                ).map(([t, label, Icon]) => (
                  <button key={t} onClick={() => setTool(t)}>
                    <Icon size={20} />
                    {label}
                  </button>
                ))}
              </nav>
            </>
          ))}
        <div className="sidebar-bottom">
          <div className="sidebar-doodle">
            <Doodle name="sun" colour="#FFD69A" />
            <p>
              Your whole trip.
              <br />A lovely adventure.
            </p>
          </div>
          {!shared?.public && !compactNav && (
            <button
              className="sidebar-settings"
              onClick={() => setTool("settings")}
            >
              <GearSix size={19} /> Trip settings
            </button>
          )}
          <Link
            to="/app/settings"
            className="sidebar-account"
            title="Account settings"
            aria-label="Account settings"
          >
            <span className="avatar">{state.organizer[0]}</span>
            <span className="sidebar-account-label">
              {demo
                ? "Demo explorer"
                : shared?.public
                  ? "Shared trip"
                  : state.organizer}
              <small>
                {demo
                  ? "Make yourself at home"
                  : record.isFree
                    ? "Your first trip, on us"
                    : "Your next adventure"}
              </small>
            </span>
          </Link>
        </div>
      </aside>
      <div className="planner-body">
        {demo && (
          <div className="demo-banner">
            <span>
              <Doodle name="spark" /> You’re exploring an example trip. Changes
              stay on this device.
            </span>
            <Link to="/signup">
              Make one of your own <ArrowUpRight size={16} />
            </Link>
            <button
              className="plain-link"
              onClick={() => {
                setDemoRecord(makeDemo());
                localStorage.removeItem("whereto-demo");
                toast.success("Demo reset.");
              }}
            >
              Reset
            </button>
          </div>
        )}
        {offline && !demo && (
          <Notice>
            <WifiSlash size={18} /> You’re offline. This is a saved copy for
            reading; editing will return when you reconnect.
          </Notice>
        )}
        <header className="planner-header">
          <div>
            <span className="eyebrow">
              {shared?.public
                ? "A TRIP, SHARED WITH YOU"
                : "YOUR NEXT ADVENTURE"}
            </span>
            <h1>{state.title}</h1>
            <p>
              <CalendarBlank size={15} />
              {state.startDate} — {state.endDate}
              <span>·</span>
              <Users size={15} />
              {shared?.public
                ? "Shared itinerary"
                : `${state.participants.length} travellers`}
              <span className="locked-pill">
                <LockKey size={12} /> Destinations fixed
              </span>
            </p>
          </div>
          <div className="planner-header-actions">
            <span className="save-status" role="status" data-saving={saving}>
              {saving ? <SpinnerGap size={14} /> : <Check size={14} />}
              {saving
                ? "Saving…"
                : demo
                  ? "Saved in demo"
                  : offline
                    ? "Offline copy"
                    : "All changes saved"}
            </span>
            {!shared?.public && (
              <>
                <TripSearch items={state.items} onSelect={setEditing} />
                <Button
                  variant="secondary"
                  aria-label="Share trip"
                  onClick={() => setTool("share")}
                >
                  <ShareNetwork size={17} />
                  <span>Share</span>
                </Button>
                <Button
                  variant="secondary"
                  aria-label="Export trip"
                  onClick={() => setTool("export")}
                >
                  <DownloadSimple size={17} />
                  <span>Export</span>
                </Button>
              </>
            )}
          </div>
        </header>
        {!shared?.public && (
          <GuidedHelp
            scope="planner"
            userId={demo ? "demo" : me.data?.user.id || "trip"}
            onAction={(action) => {
              window.scrollTo({ top: 0, behavior: "instant" });
              if (["days", "reorder"].includes(action)) {
                setMobileMap(false);
                setView("itinerary");
              } else if (action === "map") {
                setView("itinerary");
                setMobileMap(true);
              } else if (action === "trains") setTransitOpen(true);
              else if (action === "discover") setDiscovery(true);
              else if (action === "compare") setCompareOpen(true);
              else if (action === "notes") {
                setCommentItem(items[0]?.id ?? "");
                setCommentsOpen(true);
              } else if (["budget", "ideas", "today"].includes(action))
                setView(action as View);
              else if (action === "add") add("activity");
              else if (
                [
                  "people",
                  "checklist",
                  "documents",
                  "history",
                  "trash",
                  "settings",
                  "share",
                  "export",
                ].includes(action)
              )
                setTool(action as Tool);
              else if (
                ["import", "receipt", "polls", "transfers"].includes(action)
              ) {
                setTransferNeed(undefined);
                setPlanningTool(
                  action as "import" | "receipt" | "polls" | "transfers",
                );
              } else if (action === "search")
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>(".trip-search-trigger")
                    ?.click(),
                );
              else navigate("/app/settings");
            }}
          />
        )}
        <nav className="mobile-app-nav" aria-label="Mobile trip views">
          <MotionGroup>
            <MotionChoice
              active={view === "itinerary"}
              aria-label="Itinerary"
              onClick={() => setView("itinerary")}
            >
              <CalendarBlank size={20} />
              <span className="nav-label">Itinerary</span>
            </MotionChoice>
            <MotionChoice
              active={view === "budget"}
              aria-label="Budget"
              onClick={() => setView("budget")}
            >
              <Wallet size={20} />
              <span className="nav-label">Budget</span>
            </MotionChoice>
            <MotionChoice
              active={view === "ideas"}
              aria-label="Ideas"
              onClick={() => setView("ideas")}
            >
              <Lightbulb size={20} />
              <span className="nav-label">Ideas</span>
            </MotionChoice>
          </MotionGroup>
          {!shared?.public && (
            <div className="mobile-nav-search">
              <TripSearch items={state.items} onSelect={setEditing} />
            </div>
          )}
          {!shared?.public && (
            <details
              ref={mobileToolsDropdown}
              className="mobile-tools mobile-tools-dropdown"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.currentTarget.open = false;
                  event.currentTarget.querySelector("summary")?.focus();
                }
              }}
            >
              <summary aria-controls="mobile-trip-tools">
                <SquaresFour size={20} aria-hidden="true" />
                <span className="nav-label">Tools</span>
              </summary>
              <div
                id="mobile-trip-tools"
                className="mobile-tools-grid"
                onClick={(event) => {
                  const target = event.target;
                  if (
                    target instanceof HTMLElement &&
                    target.closest("button")
                  ) {
                    const details = event.currentTarget.closest("details");
                    if (details) details.open = false;
                  }
                }}
              >
                <button
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => setPlanningTool("import")}
                >
                  <UploadSimple size={21} aria-hidden="true" />
                  <span>Import a booking</span>
                </button>
                <button
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => setPlanningTool("receipt")}
                >
                  <Receipt size={21} aria-hidden="true" />
                  <span>Split a receipt</span>
                </button>
                <button
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => setPlanningTool("polls")}
                >
                  <UsersThree size={21} aria-hidden="true" />
                  <span>Group votes</span>
                </button>
                <button
                  type="button"
                  disabled={readOnly || saving}
                  onClick={() => {
                    setTransferNeed(undefined);
                    setPlanningTool("transfers");
                  }}
                >
                  <Train size={21} aria-hidden="true" />
                  <span>Airport transfers</span>
                </button>
                <button
                  type="button"
                  aria-pressed={view === "today"}
                  onClick={() => setView("today")}
                >
                  <Sun size={21} aria-hidden="true" />
                  <span>Today</span>
                </button>
                <button type="button" onClick={() => setTransitOpen(true)}>
                  <Train size={21} aria-hidden="true" />
                  <span>Trains</span>
                </button>
                {(
                  [
                    ["people", "People", Users],
                    ["checklist", "Checklist", CheckSquare],
                    ["documents", "Documents", Files],
                    ["history", "History", ClockCounterClockwise],
                    ["trash", "Recently deleted", Trash],
                    ["settings", "Trip settings", GearSix],
                  ] as const
                ).map(([tool, label, Icon]) => (
                  <button
                    type="button"
                    key={tool}
                    onClick={() => setTool(tool)}
                  >
                    <Icon size={21} aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </nav>
        {!shared?.public && (
          <PlanningEssentials
            state={state}
            disabled={readOnly || saving}
            onFix={fixMissing}
            onImport={() => setPlanningTool("import")}
            onReceipt={() => setPlanningTool("receipt")}
            onPolls={() => setPlanningTool("polls")}
            onTransfers={() => {
              setTransferNeed(undefined);
              setPlanningTool("transfers");
            }}
          />
        )}
        <MotionPanel
          key={view}
          changeKey={view}
          order={["itinerary", "today", "ideas", "budget"].indexOf(view)}
          distance={10}
          className="planner-view"
        >
          {view === "budget" ? (
            <BudgetView
              state={state}
              onEdit={setEditing}
              onAdd={() => add("other")}
              onCommand={safeRun}
              readOnly={readOnly}
            />
          ) : (
            <>
              <div className="itinerary-controls">
                <div className="day-tabs" aria-label="Travel days">
                  <MotionGroup>
                    {view === "itinerary" &&
                      days.map((d, i) => (
                        <MotionChoice
                          key={d}
                          active={selectedDay === d}
                          onClick={() => {
                            setDay(d);
                            setTravel({});
                          }}
                        >
                          <small>DAY {i + 1}</small>
                          <strong>
                            {new Date(d + "T12:00").toLocaleDateString(
                              "en-GB",
                              {
                                weekday: "short",
                                day: "numeric",
                              },
                            )}
                          </strong>
                        </MotionChoice>
                      ))}
                  </MotionGroup>
                  {view === "ideas" && (
                    <div className="view-title">
                      <h2>Room for inspiration.</h2>
                      <p>
                        Save the possibilities. Only planned stops count towards
                        your budget.
                      </p>
                    </div>
                  )}
                  {view === "today" && (
                    <div className="view-title">
                      <h2>A lovely day ahead.</h2>
                      <p>
                        Times are local to each stop. Updates as your day goes
                        on.
                      </p>
                    </div>
                  )}
                </div>
                <button
                  className="button button-secondary map-toggle"
                  aria-label={mobileMap ? "Show the plan" : "Show the map"}
                  aria-pressed={mobileMap}
                  aria-controls="trip-itinerary-surface"
                  onClick={() =>
                    changeSurface(() => setMobileMap((shown) => !shown))
                  }
                >
                  {mobileMap ? (
                    <CalendarBlank size={20} aria-hidden="true" />
                  ) : (
                    <MapTrifold size={20} aria-hidden="true" />
                  )}
                  {mobileMap ? "Plan" : "Map"}
                </button>
              </div>
              <div
                id="trip-itinerary-surface"
                className={`itinerary-layout ${mobileMap ? "show-mobile-map" : ""}`}
              >
                <MotionPanel
                  changeKey={selectedDay}
                  order={days.indexOf(selectedDay)}
                  distance={16}
                  className="day-plan"
                >
                  {view === "today" && !shared?.public && (
                    <TodayFocus
                      state={state}
                      plan={todayInfo!}
                      onEdit={setEditing}
                      onExpense={() => add("other")}
                      onDocuments={() => setTool("documents")}
                      onPlan={() => {
                        setView("itinerary");
                        setDay(state.startDate);
                      }}
                      readOnly={readOnly}
                    />
                  )}
                  <div className="day-heading">
                    <div>
                      <span className="eyebrow">
                        {view === "ideas"
                          ? "THE MAYBE LIST"
                          : view === "today"
                            ? "RIGHT HERE, RIGHT NOW"
                            : `DAY ${days.indexOf(selectedDay) + 1} · TAKE IT ALL IN`}
                      </span>
                      <h2>
                        {view === "ideas"
                          ? "Places worth considering."
                          : view === "today"
                            ? "Your plans for today."
                            : new Date(
                                selectedDay + "T12:00",
                              ).toLocaleDateString("en-GB", {
                                weekday: "long",
                                day: "numeric",
                                month: "long",
                              })}
                      </h2>
                    </div>
                    {view === "itinerary" && !readOnly && (
                      <Button
                        variant="ghost"
                        disabled={items.length < 2}
                        onClick={() => void suggest()}
                      >
                        <Doodle name="spark" /> Find a nicer order
                      </Button>
                    )}
                  </div>
                  {warnings.map((w) => (
                    <Notice key={w} error>
                      {w}
                    </Notice>
                  ))}
                  {view === "itinerary" && items.length > 1 && (
                    <div className="day-route-tools">
                      <button
                        className="plain-link"
                        onClick={() => void checkTravel()}
                      >
                        <Clock size={14} /> Check walking times
                      </button>
                      {undoOrder && (
                        <button
                          className="plain-link"
                          onClick={() => {
                            void reorder(undoOrder)
                              .then(() => setUndoOrder(null))
                              .catch(() => {});
                          }}
                        >
                          Undo reordering
                        </button>
                      )}
                    </div>
                  )}
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onDragEnd}
                  >
                    <SortableContext
                      items={shownItems.map((i) => i.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="timeline">
                        <AnimatePresence initial={false} mode="popLayout">
                          {shownItems.map((item, index) => (
                            <motion.div
                              key={item.id}
                              layout={instant ? false : "position"}
                              initial={
                                instant
                                  ? false
                                  : { opacity: 0, y: 10, scale: 0.985 }
                              }
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{
                                opacity: 0,
                                scale: instant ? 1 : 0.97,
                                transition: { duration: instant ? 0 : 0.15 },
                              }}
                              transition={
                                instant ? { duration: 0 } : softSpring
                              }
                            >
                              <ItemRow
                                item={item}
                                displayDay={
                                  view === "today" ? today : selectedDay
                                }
                                index={index}
                                currency={state.currency}
                                onEdit={() => {
                                  setActiveId(item.id);
                                  setEditing(item);
                                }}
                                onDelete={() =>
                                  void safeRun({
                                    type: "item.delete",
                                    id: item.id,
                                  }).then(() =>
                                    toast("Moved to recently deleted", {
                                      action: {
                                        label: "Undo",
                                        onClick: () =>
                                          void safeRun({
                                            type: "item.restore",
                                            id: item.id,
                                          }),
                                      },
                                    }),
                                  )
                                }
                                onMove={(delta) => move(item, delta)}
                                onMenu={() => setMenuItem(item)}
                                readOnly={readOnly || view !== "itinerary"}
                              />
                              {view === "ideas" && !readOnly && (
                                <Button
                                  variant="secondary"
                                  className="idea-plan-button"
                                  onClick={() =>
                                    void safeRun({
                                      type: "item.save",
                                      item: {
                                        ...item,
                                        state: "planned",
                                        day: selectedDay,
                                      },
                                    })
                                  }
                                >
                                  Add to{" "}
                                  {new Date(
                                    selectedDay + "T12:00",
                                  ).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                  })}{" "}
                                  <ArrowRight size={16} />
                                </Button>
                              )}
                              {index < shownItems.length - 1 &&
                                travel[
                                  `${item.id}:${shownItems[index + 1]!.id}`
                                ] !== undefined && (
                                  <div className="travel-leg">
                                    {Math.ceil(
                                      travel[
                                        `${item.id}:${shownItems[index + 1]!.id}`
                                      ]!,
                                    )}{" "}
                                    min walk
                                  </div>
                                )}
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </SortableContext>
                  </DndContext>
                  {!shownItems.length && (
                    <div className="day-empty">
                      <Doodle
                        name={view === "today" ? "sun" : "map"}
                        colour="#CDE5D4"
                      />
                      <h3>
                        {view === "today"
                          ? "No scheduled stops today."
                          : "A whole day of possibilities."}
                      </h3>
                      <p>
                        {view === "today"
                          ? "Your plan is ready whenever your adventure starts."
                          : "A favourite café. That museum. Time to explore."}
                      </p>
                      {!readOnly &&
                        view === "itinerary" &&
                        !state.items.some(
                          (item) => !item.deletedAt && item.state !== "idea",
                        ) && (
                          <div
                            className="empty-trip-actions"
                            aria-label="Start your trip"
                          >
                            <Button
                              variant="secondary"
                              onClick={() => add("accommodation")}
                            >
                              <Doodle name="suitcase" colour="#E8ACA0" />
                              Add your stay
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => add("transport")}
                            >
                              <Train size={24} aria-hidden="true" />
                              Add transport
                            </Button>
                            <Button variant="secondary" onClick={() => add()}>
                              <Doodle name="map" colour="#CDE5D4" />
                              Plan your first day
                            </Button>
                          </div>
                        )}
                    </div>
                  )}
                  {!readOnly &&
                    !(
                      view === "itinerary" &&
                      !state.items.some(
                        (item) => !item.deletedAt && item.state !== "idea",
                      )
                    ) && (
                      <RadialAdd
                        label={
                          view === "ideas" ? "Save an idea" : "Add to your day"
                        }
                        onAdd={add}
                      />
                    )}
                  <div className="day-total">
                    <span>
                      <Doodle name="wallet" colour="#FFD69A" />{" "}
                      {view === "ideas"
                        ? "Ideas don’t count towards your budget."
                        : "Your day, with a clear budget."}
                    </span>
                    {view !== "ideas" && (
                      <strong>
                        {money(
                          shownItems.reduce(
                            (sum, i) =>
                              sum +
                              (i.flight &&
                              i.day !== (view === "today" ? today : selectedDay)
                                ? 0
                                : itemTotal(i).toNumber()),
                            0,
                          ),
                          state.currency,
                        )}
                      </strong>
                    )}
                  </div>
                  {!shared?.public && !readOnly && (
                    <div className="context-actions">
                      <button
                        className="plain-link"
                        onClick={() => {
                          setCommentsOpen(true);
                          setCommentItem(items[0]?.id ?? "");
                        }}
                      >
                        <ChatCircle size={17} /> Notes together
                      </button>
                      <button
                        className="plain-link"
                        onClick={() => setCompareOpen(true)}
                      >
                        <Wallet size={17} /> Compare alternatives
                      </button>
                    </div>
                  )}
                </MotionPanel>
                <aside className="itinerary-side">
                  <Suspense
                    fallback={
                      <div className="map-placeholder">Unfolding the map…</div>
                    }
                  >
                    <MapView
                      items={shownItems}
                      destinations={state.destinations}
                      demo={demo}
                      activeId={activeId}
                      onSelect={(id) => {
                        setActiveId(id);
                        setEditing(state.items.find((i) => i.id === id)!);
                      }}
                      publicToken={shared?.token}
                    />
                  </Suspense>
                  <div className="little-budget">
                    <span>
                      <Doodle name="wallet" colour="#FFD69A" />
                      <span>
                        Your trip, so far
                        <strong>
                          {money(summary.total, state.currency)}{" "}
                          <small>
                            {state.budget
                              ? `of ${money(state.budget, state.currency)}`
                              : "planned"}
                          </small>
                        </strong>
                      </span>
                    </span>
                    {state.budget && (
                      <div className="budget-track">
                        <i
                          style={{
                            width: `${Math.min(100, (Number(summary.total) / Number(state.budget)) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                    <button
                      className="plain-link"
                      onClick={() => setView("budget")}
                    >
                      See the whole picture <ArrowRight size={15} />
                    </button>
                  </div>
                  {!shared?.public && (
                    <div className="discovery-card">
                      <Doodle name="sun" colour="#CBDDF0" />
                      <span className="eyebrow">LOCAL INSPIRATION</span>
                      <h3>
                        What’s around
                        <br />
                        the next corner?
                      </h3>
                      <p>
                        Find a new favourite café, a lovely view, or something
                        you didn’t know you’d love.
                      </p>
                      <Button
                        variant="secondary"
                        onClick={() => setDiscovery(true)}
                      >
                        Explore places <ArrowUpRight size={18} />
                      </Button>
                      <button
                        className="plain-link train-link"
                        onClick={() => setTransitOpen(true)}
                      >
                        <Train size={21} aria-hidden="true" /> Find a train
                        connection
                      </button>
                    </div>
                  )}
                </aside>
              </div>
            </>
          )}
        </MotionPanel>
        <Suspense fallback={<p role="status">Opening your trip tools…</p>}>
          <AnimatePresence>
            {planningTool === "import" && !readOnly && (
              <PlanningImport
                key="import"
                state={state}
                demo={demo}
                onSave={saveImport}
                onClose={() => setPlanningTool(null)}
                onExisting={setEditing}
              />
            )}
            {planningTool === "receipt" && !readOnly && (
              <ReceiptImport
                key="receipt"
                state={state}
                demo={demo}
                onSave={saveImport}
                onClose={() => setPlanningTool(null)}
              />
            )}
            {planningTool === "polls" && !readOnly && (
              <GroupPolls
                key="polls"
                state={state}
                owner={record.role === "owner"}
                actorId={demo ? "demo-organizer" : (me.data?.user.id ?? "")}
                onCommand={run}
                onClose={() => setPlanningTool(null)}
                onIdeas={() => {
                  setPlanningTool(null);
                  setView("ideas");
                }}
              />
            )}
            {planningTool === "transfers" && !readOnly && (
              <TransferPlanner
                key="transfers"
                state={state}
                tripId={record.id}
                initial={transferNeed}
                demo={demo}
                onClose={() => setPlanningTool(null)}
                onSave={(item) => run({ type: "item.save", item })}
              />
            )}
          </AnimatePresence>
        </Suspense>
        <AnimatePresence>
          {quickAdding && (
            <QuickAdd
              key={`quick-${quickAdding.id}`}
              item={quickAdding}
              state={state}
              expense={quickAdding.kind === "other"}
              onSave={(item) => run({ type: "item.save", item })}
              onClose={() => setQuickAdding(null)}
              onDetails={(item) => {
                setQuickAdding(null);
                setEditing(item);
              }}
            />
          )}
          {editing && (
            <ItemEditor
              key={`edit-${editing.id}`}
              initialTab={editorTab}
              item={editing}
              state={state}
              onClose={() => {
                setEditing(null);
                setEditorTab("details");
              }}
              onSave={(item) => run({ type: "item.save", item })}
              demo={demo}
              readOnly={readOnly}
              hideFinancial={!!shared?.public && !shared.showBudget}
            />
          )}
          {tool && (
            <TripTools
              key={`tool-${tool}`}
              tool={tool}
              onClose={() => setTool(null)}
              state={state}
              tripId={record.id}
              version={record.version}
              onCommand={run}
              demo={demo}
              owner={record.role === "owner"}
            />
          )}
          {menuItem && (
            <MenuPanel
              key={`menu-${menuItem.id}`}
              item={menuItem}
              tripId={record.id}
              state={state}
              onClose={() => setMenuItem(null)}
              onSave={(item) => run({ type: "item.save", item })}
              demo={demo}
            />
          )}
        </AnimatePresence>
        <Modal
          open={!!proposal}
          onOpenChange={(v) => {
            if (!v) setProposal(null);
          }}
          title="A smoother route?"
          description="Ordered by proximity from your stay. Fixed reservations keep their position. Review before applying."
        >
          <ol className="order-preview">
            {proposal?.map((id) => (
              <li key={id}>
                {state.items.find((i) => i.id === id)?.title}
                {state.items.find((i) => i.id === id)?.fixed && (
                  <LockKey size={15} />
                )}
              </li>
            ))}
          </ol>
          <Notice>
            This is a proximity suggestion. Check transport times and opening
            hours before you set off.
          </Notice>
          <Button
            onClick={() => {
              if (proposal) {
                setUndoOrder(items.map((i) => i.id));
                void reorder(proposal)
                  .then(() => setProposal(null))
                  .catch(() => {});
              }
            }}
          >
            Use this order <Check size={18} />
          </Button>
        </Modal>
        <Modal
          open={discovery}
          onOpenChange={setDiscovery}
          title="Find your next favourite."
          description="Search places to add to your plan, or explore activities with GetYourGuide."
        >
          <LocationPicker
            demo={demo}
            bias={state.destinations[0]}
            onSelect={(place) => {
              const item = newItem(state, selectedDay);
              item.title = place.name;
              item.location = place;
              setEditing(item);
              setDiscovery(false);
            }}
          />
          <div className="discovery-links">
            <Doodle name="map" colour="#CDE5D4" />
            <h3>Worth remembering.</h3>
            <a
              className="button button-secondary"
              href={`https://www.getyourguide.com/s/?q=${encodeURIComponent(state.destinations[0]!.name)}`}
              target="_blank"
              rel="noreferrer"
            >
              Find activities on GetYourGuide <ArrowUpRight size={18} />
            </a>
            <p className="fine-print">
              Bookings happen on GetYourGuide. Add the confirmed details and
              cost to your plan afterwards.
            </p>
            <button
              className="plain-link"
              onClick={() => {
                setDiscovery(false);
                add();
              }}
            >
              Add a place manually
            </button>
          </div>
          <GoogleDiscovery demo={demo} destination={state.destinations[0]!} />
        </Modal>
        <AnimatePresence>
          {transitOpen && (
            <TransitModal
              key="transit"
              onChoose={(item) => {
                setTransitOpen(false);
                setEditing(item);
              }}
              state={state}
              demo={demo}
              onClose={() => setTransitOpen(false)}
            />
          )}
        </AnimatePresence>
        <Modal
          open={compareOpen}
          onOpenChange={setCompareOpen}
          title="Compare your options."
          description="Compare saved ideas with planned options. Unchosen ideas are never added to the trip total."
        >
          <CompareOptions state={state} demo={demo} />
        </Modal>
        <Modal
          open={commentsOpen}
          onOpenChange={setCommentsOpen}
          title="A note for your people."
        >
          <Field label="Attach to">
            <Select
              value={commentItem}
              onValueChange={(nextValue) => setCommentItem(nextValue)}
            >
              <SelectOption value="">Choose an activity</SelectOption>
              {state.items
                .filter((i) => !i.deletedAt)
                .map((i) => (
                  <SelectOption key={i.id} value={i.id}>
                    {i.title}
                  </SelectOption>
                ))}
            </Select>
          </Field>
          <div className="comment-list">
            {state.comments
              .filter((c) => c.itemId === commentItem)
              .map((c) => (
                <article key={c.id}>
                  <strong>{c.author}</strong>
                  <p>{c.text}</p>
                  <small>{new Date(c.createdAt).toLocaleString()}</small>
                </article>
              ))}
          </div>
          <Field label="Your note">
            <textarea
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
          </Field>
          <Button
            disabled={!commentItem || !commentText.trim()}
            onClick={() =>
              void run({
                type: "comment",
                itemId: commentItem,
                text: commentText.trim(),
              })
                .then(() => setCommentText(""))
                .catch(() => {})
            }
          >
            Add note <PaperPlaneTilt size={17} />
          </Button>
        </Modal>
      </div>
    </div>
  );
}
function TransitModal({
  state,
  demo,
  onClose,
  onChoose,
}: {
  onChoose: (item: TripItem) => void;
  state: TripRecord["state"];
  demo: boolean;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(state.destinations[0]!),
    [to, setTo] = useState(state.destinations[1] ?? state.destinations[0]!),
    [departure, setDeparture] = useState(`${state.startDate}T09:00`),
    [result, setResult] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="The lovely way from A to B."
    >
      <div className="transit-intro">
        <span className="transit-intro-icon">
          <Train size={28} aria-hidden="true" />
        </span>
        <p>
          Find a train or public transport connection for the next leg of your
          trip.
        </p>
      </div>
      <Field label="From">
        <LocationPicker demo={demo} cities onSelect={setFrom} />
        <small>{from.name}</small>
      </Field>
      <Field label="To">
        <LocationPicker demo={demo} cities onSelect={setTo} />
        <small>{to.name}</small>
      </Field>
      <Field label="Departing at (your device’s local time)">
        <input
          type="datetime-local"
          value={departure}
          onChange={(e) => setDeparture(e.target.value)}
        />
      </Field>
      {error && <Notice error>{error}</Notice>}
      <Button
        loading={busy}
        onClick={async () => {
          if (demo) {
            setError(
              "Live train search is available in your own trip when connected.",
            );
            return;
          }
          setBusy(true);
          setError("");
          try {
            setResult(
              await post("/transit", {
                a: from,
                b: to,
                departure: new Date(departure).toISOString(),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Find connections <ArrowRight size={18} />
      </Button>
      {result?.routes?.map((r: any, i: number) => (
        <div className="transit-result" key={i}>
          <strong>
            Connection {i + 1} · {Math.ceil(parseInt(r.duration) / 60)} minutes
          </strong>
          {r.legs
            ?.flatMap((l: any) => l.steps ?? [])
            .filter((s: any) => s.transitDetails)
            .map((s: any, j: number) => (
              <p key={j}>
                {s.transitDetails.transitLine?.name} ·{" "}
                {s.transitDetails.stopDetails?.departureStop?.name} →{" "}
                {s.transitDetails.stopDetails?.arrivalStop?.name}
                <br />
                {s.transitDetails.stopDetails?.departureTime}
              </p>
            ))}
        </div>
      ))}
      {result?.routes?.length > 0 && (
        <Button
          variant="secondary"
          onClick={() => {
            const item = newItem(state, departure.slice(0, 10));
            item.kind = "transport";
            item.category = "Transport";
            item.title = `Train: ${from.name} → ${to.name}`;
            item.location = from;
            item.endLocation = to;
            item.time = null;
            item.duration = 0;
            onChoose(item);
          }}
        >
          Add ticket details to my plan
        </Button>
      )}
      <p className="fine-print">
        Schedules and fares depend on coverage and your travel date. Purchase
        tickets with the operator, then add the booking details to your
        itinerary.
      </p>
    </Modal>
  );
}
function GoogleDiscovery({
  demo,
  destination,
}: {
  demo: boolean;
  destination: TripRecord["state"]["destinations"][number];
}) {
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function open() {
    if (demo) {
      setNotice(
        "Google discovery is available in your own trip when connected.",
      );
      return;
    }
    setBusy(true);
    try {
      const { key } = await post("/google-places-session", {});
      const w = window as any;
      if (!w.google?.maps) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=beta&loading=async`;
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Google places could not load."));
          document.head.appendChild(script);
        });
      }
      const { PlaceSearchElement } =
        await w.google.maps.importLibrary("places");
      const search = new PlaceSearchElement();
      const request = document.createElement("gmp-place-text-search-request");
      request.setAttribute("text-query", `things to do in ${destination.name}`);
      search.append(document.createElement("gmp-place-all-content"), request);
      const target = document.getElementById("google-discovery");
      target?.replaceChildren(search);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="google-discovery">
      <Button variant="ghost" loading={busy} onClick={() => void open()}>
        <Globe size={18} /> Discover with Google
      </Button>
      <div id="google-discovery" />
      {notice && <Notice>{notice}</Notice>}
      <small>
        Google content is displayed by its official Places UI Kit. Save your own
        itinerary notes separately.
      </small>
    </div>
  );
}
