import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Compass,
  ArrowLeft,
  ArrowRight,
  Question,
  X,
  Sparkle,
} from "@phosphor-icons/react";
import { useSearchParams } from "react-router-dom";
import { Modal, Button } from "./ui";
import { MotionPanel, useMotionTrigger } from "./motion";
import { usePreferences } from "../lib/preferences";
import "../pages/settings.css";

type Topic = {
  id: string;
  title: string;
  text: string;
  tip: string;
  selector?: string;
  action?: string;
};
const dashboard: Topic[] = [
  {
    id: "welcome",
    title: "Your journeys start here.",
    text: "This is home for every trip you own or have joined. Open a trip card to find its itinerary, people and budget together.",
    tip: "Shared trips sit alongside your own. Your access is set by the person who invited you.",
    selector: ".dashboard-main",
  },
  {
    id: "new",
    title: "Make room for a new adventure.",
    text: "Plan a trip walks you through your people, destinations, travel dates and budget. Your draft saves on this device as you go.",
    tip: "Choose every main destination before creating your trip. Dates can change until departure.",
    selector: ".toolbar",
    action: "Plan a trip",
  },
  {
    id: "search",
    title: "Find the trip you had in mind.",
    text: "Open the search icon and type a trip name or destination. Clear the field or press Escape to see everything again.",
    tip: "Search works within the Your trips or Archived view you have selected.",
    selector: ".dashboard-search-row",
  },
  {
    id: "archive",
    title: "Finished travelling? Keep the memories.",
    text: "Archive moves a trip out of your main list. Find it under Archived and choose Restore trip whenever you need it.",
    tip: "Archiving preserves your trip and does not reset your free-trip allowance.",
    selector: ".toolbar",
  },
  {
    id: "account",
    title: "Make Whereto feel like yours.",
    text: "Account settings holds your profile, password, authenticator, active sessions, planning defaults and billing. You can replay these guides there too.",
    tip: "Trip settings belongs to one trip. Account settings follows you across your trips.",
    selector: ".app-header",
    action: "Open account settings",
  },
];
const planner: Topic[] = [
  {
    id: "welcome",
    title: "Your whole trip, in one place.",
    text: "Use Itinerary for your days, Budget for costs and Ideas for plans you are still considering. Today brings the current day into focus.",
    tip: "The sidebar stays with you as you scroll. Use its small panel icon for a compact view.",
    selector: ".planner-header",
  },
  {
    id: "days",
    title: "One day at a time.",
    text: "Choose a date from the day strip. Swipe or scroll it to reach later dates on a longer journey. The selected day stays highlighted.",
    tip: "On smaller screens, Map switches between your plan and the map.",
    selector: ".day-tabs",
    action: "Open itinerary",
  },
  {
    id: "add",
    title: "Add something worth going for.",
    text: "Add to your day opens a fan of choices: activity, food, stay, transport or expense. Start with a name and add details when you know them.",
    tip: "One booking keeps its plan and cost together. You do not need to add it again in Budget.",
    selector: ".radial-add",
    action: "Add an activity",
  },
  {
    id: "reorder",
    title: "Give the day a comfortable rhythm.",
    text: "Drag a stop using its handle, or use its earlier and later buttons. Check walking times to help judge how much fits into a day.",
    tip: "The order suggestion is a preview. Review it before applying it.",
    selector: ".day-route-tools",
    action: "Open itinerary",
  },
  {
    id: "budget",
    title: "A booking and a payment are different.",
    text: "The planned total includes estimates and confirmed costs. Payments and deposits reduce what is left to pay; they do not add another expense.",
    tip: "Open an expense to edit cost lines, choose travellers and record payments or refunds.",
    selector: ".budget-stats",
    action: "Open budget",
  },
  {
    id: "people",
    title: "Bring your travel people together.",
    text: "Name everyone in Your people. In an expense, the avatar picker lets you include the whole group or just the people sharing that cost.",
    tip: "Adding a name tracks their share. Use Share to invite someone to open the actual trip.",
    action: "Open your people",
  },
  {
    id: "ideas",
    title: "Keep the maybes somewhere lovely.",
    text: "Save possibilities in Ideas before assigning them a day. Compare alternatives and move a choice into the plan when you are ready.",
    tip: "Ideas are kept apart from your planned budget until they become part of the itinerary.",
    action: "Open ideas",
  },
  {
    id: "today",
    title: "Find what matters right now.",
    text: "Today follows the trip destination’s local date and shows the day’s plans. Outside the travel period it explains where you are in relation to the trip.",
    tip: "Times are local to the destination; flight times are local to each airport.",
    action: "Open today",
  },
  {
    id: "checklist",
    title: "Leave with the essentials.",
    text: "Use the checklist for preparations and packing. Add what matters to your group and tick things off as you go.",
    tip: "The checklist saves with the trip, so everyone with editing access can help.",
    action: "Open checklist",
  },
  {
    id: "documents",
    title: "Keep the important bits close.",
    text: "Documents holds your tickets and useful files. Open a file from here when you need it during the journey.",
    tip: "Private documents are not included in public share links.",
    action: "Open documents",
  },
  {
    id: "import",
    title: "Turn a confirmation into a plan.",
    text: "Import a booking accepts confirmation text or a supported file. Review the extracted dates, places and costs before saving it.",
    tip: "Always compare the preview with your actual booking; extraction can miss details.",
    action: "Import a booking",
  },
  {
    id: "receipt",
    title: "Split the table, without the maths.",
    text: "Split a receipt helps turn receipt lines into a shared cost. Check the amounts, then assign the people included in each share.",
    tip: "Review currency and quantities before confirming the expense.",
    action: "Split a receipt",
  },
  {
    id: "polls",
    title: "Let the group choose.",
    text: "Group votes collects opinions about your options. Create a question and choices, then let your fellow travellers vote.",
    tip: "A vote helps you decide. It does not book anything or add a cost automatically.",
    action: "Open group votes",
  },
  {
    id: "transfers",
    title: "Connect your arrival to your stay.",
    text: "Airport transfers uses your saved flight and stay details to help fill the gap between them. Trains gives you a place to explore rail journeys.",
    tip: "Transport suggestions are planning information. Check availability with the provider before booking.",
    action: "Open transfers",
  },
  {
    id: "search",
    title: "Find a plan from any day.",
    text: "The search icon finds stops, places and bookings across the whole trip, including Ideas. Choose a result to open its details.",
    tip: "You can search without switching through every day.",
    selector: ".trip-search-trigger",
    action: "Search the trip",
  },
  {
    id: "share",
    title: "Share just what you mean to.",
    text: "Invite collaborators or create a public view. Review the access level and the budget and accommodation options before sharing a link.",
    tip: "Public links can be revoked. People with a view-only link cannot edit the trip.",
    selector: '.planner-header-actions [aria-label="Share trip"]',
    action: "Open sharing",
  },
  {
    id: "export",
    title: "Take a copy along.",
    text: "Export the whole trip or selected days using the available formats. Choose the details you want included before downloading.",
    tip: "A downloaded copy is a snapshot. Export it again after changing the plan.",
    selector: '.planner-header-actions [aria-label="Export trip"]',
    action: "Open export",
  },
  {
    id: "history",
    title: "Find your way back to a change.",
    text: "History lists changes to the trip. Recently deleted lets you recover removed stops while they are still available there.",
    tip: "Use Trip settings for the trip title and planning details, and Account settings for your personal preferences.",
    action: "Open trip history",
  },
  {
    id: "map",
    title: "See how your day fits together.",
    text: "The map shows the places in the selected day. Choose a pin to open that stop, and pan or zoom to explore the area.",
    tip: "On mobile, use Plan to return from the map. A place needs a location before it can appear as a pin.",
    action: "Open the map",
  },
  {
    id: "trains",
    title: "Make the journey part of the adventure.",
    text: "Find a train connection lets you choose the departure, arrival and travel date, then review a connection before adding it to the plan.",
    tip: "A saved train plan is not a ticket. Confirm schedules and buy tickets with the train operator.",
    action: "Find a train",
  },
  {
    id: "discover",
    title: "Follow your curiosity.",
    text: "Explore places finds cafés, sights and activities near your destination. Choose a place to start a plan with its location already filled in.",
    tip: "You can add a place manually too. External activity bookings happen on the provider’s website.",
    action: "Explore places",
  },
  {
    id: "compare",
    title: "Make space for the best option.",
    text: "Compare alternatives puts saved ideas alongside planned choices so you can weigh their costs before deciding.",
    tip: "Options you have not chosen stay outside your planned trip total.",
    action: "Compare alternatives",
  },
  {
    id: "notes",
    title: "Keep the conversation with the plan.",
    text: "Notes together attaches a message to an activity. Choose the stop, read existing notes and leave a detail for your travel companions.",
    tip: "Notes save with the trip. They are useful for meeting points, preferences and decisions you want everyone to remember.",
    action: "Open shared notes",
  },
  {
    id: "trash",
    title: "Changed your mind about that stop?",
    text: "Recently deleted keeps removed stops available to restore. Open it, find the item and bring it back into your trip.",
    tip: "History records changes; Recently deleted is where you recover a removed plan.",
    action: "Open recently deleted",
  },
  {
    id: "settings",
    title: "Tune the details of this trip.",
    text: "Trip settings lets you rename your journey, adjust its group budget, choose a starting view and add budget categories. Travel dates can change before the trip starts.",
    tip: "Main destinations and the trip currency stay fixed. Personal defaults and security live in Account settings.",
    action: "Open trip settings",
  },
];

export default function GuidedHelp({
  scope,
  userId,
  onAction,
}: {
  scope: "dashboard" | "planner";
  userId: string;
  onAction: (id: string) => void;
}) {
  const topics = scope === "dashboard" ? dashboard : planner;
  const preferences = usePreferences();
  const [params, setParams] = useSearchParams();
  const key = `whereto-guide:${userId}:${scope}`;
  const [seen, setSeen] = useState(() => {
    try {
      return !!localStorage.getItem(key);
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(params.get("guide") === "true");
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const handoff = useRef(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const motionTrigger = useMotionTrigger();
  const topic = topics[index] ?? topics[0]!;
  useEffect(() => {
    try {
      setSeen(!!localStorage.getItem(key));
    } catch {
      setSeen(false);
    }
  }, [key]);
  useEffect(() => {
    if (open)
      document
        .querySelector<HTMLElement>('.guide-topic-picker [aria-current="step"]')
        ?.scrollIntoView({
          block: "nearest",
          inline: "center",
          behavior: "instant",
        });
  }, [open, index]);
  const markSeen = () => {
    setSeen(true);
    try {
      localStorage.setItem(key, "true");
    } catch {}
  };
  useEffect(() => {
    if (params.get("guide") === "true") {
      setOpen(true);
      const next = new URLSearchParams(params);
      next.delete("guide");
      setParams(next, { replace: true });
    }
  }, [params]);
  useEffect(() => {
    if (!open || !topic.selector) {
      setRect(null);
      return;
    }
    const target = [
      ...document.querySelectorAll<HTMLElement>(topic.selector),
    ].find((el) => el.getBoundingClientRect().width > 0);
    if (!target) {
      setRect(null);
      return;
    }
    const update = () => setRect(target.getBoundingClientRect());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, topic]);
  return (
    <>
      {!seen && preferences.showGuides && (
        <aside className="guide-welcome">
          <Compass size={24} aria-hidden="true" />
          <div>
            <strong>A place for all your plans.</strong>
            <p>Let’s show you where everything lives.</p>
          </div>
          <button
            className="guide-start"
            onClick={() => {
              handoff.current = false;
              setOpen(true);
              markSeen();
            }}
          >
            Show me around <ArrowRight size={16} />
          </button>
          <button
            className="guide-dismiss"
            aria-label="Dismiss welcome guide"
            onClick={markSeen}
          >
            <X size={17} />
          </button>
        </aside>
      )}
      <button
        ref={launcher}
        className="help-launcher"
        aria-label="Open help and tutorials"
        onClick={() => {
          handoff.current = false;
          setOpen(true);
          markSeen();
        }}
      >
        <Question size={20} />
        <span>Help & guides</span>
      </button>
      {open &&
        rect &&
        rect.top < innerHeight &&
        rect.bottom > 0 &&
        createPortal(
          <div
            className="guide-highlight"
            aria-hidden="true"
            style={{
              left: Math.max(4, rect.left - 5),
              top: Math.max(4, rect.top - 5),
              width: Math.min(innerWidth - 8, rect.width + 10),
              height: Math.min(innerHeight - 8, rect.height + 10),
            }}
          />,
          document.body,
        )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={
          scope === "dashboard" ? "Find your feet." : "Your trip, explained."
        }
        onCloseAutoFocus={(event) => {
          if (handoff.current) event.preventDefault();
        }}
      >
        <div className="guide-topic-picker" aria-label="Tutorial topics">
          {topics.map((item, i) => (
            <button
              key={item.id}
              aria-current={index === i ? "step" : undefined}
              onClick={() => setIndex(i)}
            >
              {i + 1}
              <span>{item.id === "welcome" ? "Overview" : item.id}</span>
            </button>
          ))}
        </div>
        <MotionPanel changeKey={index} order={index} distance={12}>
          <div className="guide-lesson">
            <span className="guide-step">
              <Sparkle size={18} /> GUIDE {index + 1} OF {topics.length}
            </span>
            <h3>{topic.title}</h3>
            <p>{topic.text}</p>
            <aside>{topic.tip}</aside>
          </div>
        </MotionPanel>
        {topic.action && (
          <Button
            className="full-width"
            variant="secondary"
            onClick={() => {
              handoff.current = true;
              if (motionTrigger) motionTrigger.current = launcher.current;
              setOpen(false);
              onAction(topic.id);
            }}
          >
            {topic.action}
            <ArrowRight size={17} />
          </Button>
        )}
        <div className="guide-controls">
          <Button
            variant="ghost"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            <ArrowLeft size={17} /> Previous
          </Button>
          <Button
            onClick={() =>
              index === topics.length - 1 ? setOpen(false) : setIndex(index + 1)
            }
          >
            {index === topics.length - 1 ? "Done" : "Next"}
            <ArrowRight size={17} />
          </Button>
        </div>
      </Modal>
    </>
  );
}
