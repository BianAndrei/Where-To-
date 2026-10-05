import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import {
  defaultPreferences,
  preferencesSchema,
  type UserPreferences,
} from "@whereto/shared";
import { api } from "./api";
import { presentationMode } from "./deployment";

let current = { ...defaultPreferences };
try {
  current = {
    ...current,
    ...preferencesSchema.parse(
      JSON.parse(localStorage.getItem("whereto-preferences") || "{}"),
    ),
  };
} catch {}
const listeners = new Set<() => void>();
export function applyPreferences(value: UserPreferences) {
  current = preferencesSchema.parse(value);
  try {
    localStorage.setItem("whereto-preferences", JSON.stringify(current));
    localStorage.setItem("whereto-nav-compact", String(current.compactNav));
  } catch {}
  window.dispatchEvent(new Event("whereto-navigation"));
  document.documentElement.dataset.reducedMotion = String(
    current.reducedMotion,
  );
  listeners.forEach((listener) => listener());
}
export function usePreferences() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
export function PreferenceSync() {
  const location = useLocation();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api("/me"),
    enabled: !presentationMode && location.pathname.startsWith("/app"),
  });
  useEffect(() => {
    if (me.data?.preferences) applyPreferences(me.data.preferences);
  }, [me.data?.preferences]);
  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(
      current.reducedMotion,
    );
  }, []);
  return null;
}
