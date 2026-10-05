export const publicPages = {
  "/": {
    title: "Whereto — A lovely trip. A clear budget.",
    description:
      "Plan your days, places and travel budget together. Your first trip is free, with collaboration and exports. No card required.",
  },
  "/pricing": {
    title: "Pricing — Your first trip is free | Whereto",
    description:
      "Plan your first trip free with 10 menu imports. Create more trips for €5/month or €40/year, with 30 imports a month. Existing trips stay editable after cancellation.",
  },
  "/privacy": {
    title: "Privacy | Whereto",
    description:
      "How Whereto handles your trip information, private documents and shared plans.",
  },
  "/terms": {
    title: "Terms | Whereto",
    description:
      "Whereto’s terms for free trips, subscriptions, destination rules and external travel services.",
  },
};
export function pageMetadata(pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  const entry = publicPages[path as keyof typeof publicPages];
  return {
    ...(entry ?? {
      title: path.startsWith("/admin")
        ? "Private admin workspace | Whereto"
        : path === "/demo"
          ? "Try the travel planner | Whereto"
          : path === "/signup"
            ? "Plan your first trip free | Whereto"
            : path === "/login"
              ? "Welcome back | Whereto"
              : "Your travel plans | Whereto",
      description: "Your itinerary, budget and bookings, together in Whereto.",
    }),
    indexable: !!entry,
    path,
  };
}
export function siteOrigin(value: string | undefined) {
  if (!value) return "";
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "VITE_PUBLIC_SITE_URL must be a public HTTP(S) origin without credentials.",
    );
  return url.origin;
}
