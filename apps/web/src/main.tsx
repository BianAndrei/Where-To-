import React, { lazy, Suspense, useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-500.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "./styles.css";
import "./components/doodle-motion.css";
import "./components/travel-motion.css";
import "./components/brand-logo.css";
import Landing from "./pages/Landing";
import PageMetadata from "./components/PageMetadata";
import {
  InteractionMotion,
  LoadingJourney,
  spring,
} from "./components/motion";
import "./components/interaction-motion.css";
import "./components/scrollbars.css";
import "./components/playful-controls.css";
import "./components/navigation.css";
import "./components/responsive.css";
import { PreferenceSync } from "./lib/preferences";
import { presentationMode, publicAsset } from "./lib/deployment";
const Presentation = lazy(() => import("./pages/Presentation"));
const pageModules = {
  auth: () => import("./pages/Auth"),
  dashboard: () => import("./pages/Dashboard"),
  settings: () => import("./pages/Settings"),
  onboarding: () => import("./pages/Onboarding"),
  planner: () => import("./pages/Planner"),
  share: () => import("./pages/Share"),
  pricing: () => import("./pages/Pricing"),
  legal: () => import("./pages/Legal"),
  admin: () => import("./pages/Admin"),
  twoFactor: () => import("./pages/TwoFactor"),
};
const Auth = lazy(pageModules.auth);
const Dashboard = lazy(pageModules.dashboard);
const Settings = lazy(pageModules.settings);
const Onboarding = lazy(pageModules.onboarding);
const Planner = lazy(pageModules.planner);
const Share = lazy(pageModules.share);
const Pricing = lazy(pageModules.pricing);
const Legal = lazy(pageModules.legal);
const Admin = lazy(pageModules.admin);
const TwoFactor = lazy(pageModules.twoFactor);
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30000 },
  },
});
function RouteArrival({
  children,
}: {
  children: React.ReactElement<React.ComponentProps<typeof Routes>>;
}) {
  const location = useLocation();
  useEffect(() => {
    if (location.pathname === "/demo")
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.pathname]);
  useEffect(() => {
    // Load a destination when someone approaches its link. The route transition
    // can then settle into real content instead of a flash of a loading screen.
    const prepare = (event: Event) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.origin !== window.location.origin
      )
        return;
      const path = "/" + anchor.pathname.slice(import.meta.env.BASE_URL.length);
      const load =
        path === "/demo" || path.startsWith("/app/trips/")
          ? pageModules.planner
          : path === "/app/settings"
            ? pageModules.settings
            : path === "/app/new"
              ? pageModules.onboarding
              : path === "/app"
                ? pageModules.dashboard
                : path.startsWith("/admin")
                  ? pageModules.admin
                  : ["/login", "/signup", "/reset-password"].includes(path)
                    ? pageModules.auth
                    : path === "/pricing"
                      ? pageModules.pricing
                      : ["/privacy", "/terms"].includes(path)
                        ? pageModules.legal
                        : path === "/two-factor"
                          ? pageModules.twoFactor
                          : /^\/(share|join)\//.test(path)
                            ? pageModules.share
                            : undefined;
      void load?.().catch(() => {});
    };
    document.addEventListener("pointerover", prepare, { passive: true });
    document.addEventListener("focusin", prepare);
    document.addEventListener("touchstart", prepare, { passive: true });
    return () => {
      document.removeEventListener("pointerover", prepare);
      document.removeEventListener("focusin", prepare);
      document.removeEventListener("touchstart", prepare);
    };
  }, []);
  return (
    <div className="route-arrival">
      {React.cloneElement(children, { location })}
    </div>
  );
}
// Shared motion tokens can invalidate this entry during Vite hot updates.
// Reuse the root instead of attaching a second React tree to the same container.
const root: ReactDOM.Root =
  import.meta.hot?.data.root ??
  ReactDOM.createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user" transition={spring}>
        <InteractionMotion>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <PreferenceSync />
            <PageMetadata />
            <Suspense fallback={<LoadingJourney />}>
              <RouteArrival>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  {presentationMode ? (
                    <>
                      <Route path="/login" element={<Presentation />} />
                      <Route path="/signup" element={<Presentation />} />
                      <Route path="/app/*" element={<Presentation />} />
                      <Route path="/admin/*" element={<Presentation />} />
                      <Route
                        path="/reset-password"
                        element={<Presentation />}
                      />
                      <Route path="/two-factor" element={<Presentation />} />
                      <Route path="/share/:token" element={<Presentation />} />
                      <Route path="/join/:token" element={<Presentation />} />
                    </>
                  ) : (
                    <>
                      <Route path="/login" element={<Auth />} />
                      <Route path="/signup" element={<Auth />} />
                      <Route path="/reset-password" element={<Auth />} />
                      <Route path="/app" element={<Dashboard />} />
                      <Route path="/app/settings" element={<Settings />} />
                      <Route path="/admin/*" element={<Admin />} />
                      <Route path="/two-factor" element={<TwoFactor />} />
                      <Route path="/app/new" element={<Onboarding />} />
                      <Route path="/app/trips/:id" element={<Planner />} />
                      <Route path="/share/:token" element={<Share />} />
                      <Route path="/join/:token" element={<Share join />} />
                    </>
                  )}
                  <Route path="/demo" element={<Planner demo />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/privacy" element={<Legal />} />
                  <Route path="/terms" element={<Legal />} />
                  <Route
                    path="*"
                    element={
                      <div className="empty">
                        <h1>Off the map.</h1>
                        <Link to="/">Back to Whereto</Link>
                      </div>
                    }
                  />
                </Routes>
              </RouteArrival>
            </Suspense>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors closeButton />
        </InteractionMotion>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
if (
  !presentationMode &&
  import.meta.env.BASE_URL === "/" &&
  "serviceWorker" in navigator
)
  window.addEventListener(
    "load",
    () => void navigator.serviceWorker.register(publicAsset("sw.js")),
  );
