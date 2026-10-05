import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, MagnifyingGlass, Check } from "@phosphor-icons/react";
import type { Place } from "@whereto/shared";
import { api } from "../lib/api";
import { demoPlaces } from "../lib/demo";
import { AnimatePresence, motion } from "motion/react";
import { softSpring, useInstantMotion } from "./motion";
export function LocationPicker({
  onSelect,
  cities = false,
  demo = false,
  bias,
  placeholder = "Search a city or place…",
}: {
  onSelect: (p: Place) => void;
  cities?: boolean;
  demo?: boolean;
  bias?: Place;
  placeholder?: string;
}) {
  const instant = useInstantMotion();
  const [text, setText] = useState(""),
    [q, setQ] = useState(""),
    [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setQ(text), 400);
    return () => clearTimeout(timer);
  }, [text]);
  const search = useQuery({
    queryKey: ["places", q, cities, bias?.id],
    queryFn: () =>
      demo
        ? Promise.resolve({
            places: demoPlaces.filter((p) =>
              p.name.toLowerCase().includes(q.toLowerCase()),
            ),
            notice: "Example places for the demo.",
          })
        : api<{ places: Place[]; notice?: string }>(
            `/places?q=${encodeURIComponent(q)}&cities=${cities}${bias ? `&bias=${bias.lon},${bias.lat}` : ""}`,
          ),
    enabled: q.length >= 2 && open,
  });
  return (
    <div className="location-picker">
      <div className="input-icon">
        <MagnifyingGlass size={19} />
        <input
          aria-label={cities ? "Search destinations" : "Search places"}
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (search.data?.places[0]) {
                onSelect(search.data.places[0]);
                setText("");
                setQ("");
                setOpen(false);
              }
            }
          }}
        />
      </div>
      <AnimatePresence>
        {open && q.length >= 2 && (
          <motion.div
            className="location-results"
            initial={instant ? false : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: instant ? 0 : 0.12 } }}
            transition={instant ? { duration: 0 } : softSpring}
            style={{ transformOrigin: "top center" }}
          >
            {search.isFetching && <p>Looking around…</p>}
            {search.error && <p role="alert">{search.error.message}</p>}
            {search.data?.places.map((place) => (
              <button
                type="button"
                key={place.id}
                onClick={() => {
                  onSelect(place);
                  setText("");
                  setQ("");
                  setOpen(false);
                }}
              >
                <MapPin size={20} />
                <span>
                  <strong>{place.name}</strong>
                  <small>{place.country}</small>
                </span>
                <Check size={16} />
              </button>
            ))}
            {search.data?.places.length === 0 && (
              <p>
                No matching places. Try a nearby city or add a location
                manually.
              </p>
            )}
            {search.data?.notice && <small>{search.data.notice}</small>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
