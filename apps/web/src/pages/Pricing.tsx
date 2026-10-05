import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MarketingNav, Footer, PriceCards } from "./Landing";
import { Button, Notice } from "../components/ui";
import { api, post, ApiError, type Features } from "../lib/api";
export default function Pricing() {
  const nav = useNavigate();
  const [busy, setBusy] = useState("");
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<Features>("/config"),
  });
  async function subscribe(plan: string) {
    setBusy(plan);
    try {
      const result = await post("/billing/checkout", { plan });
      window.location.assign(result.url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401)
        nav("/login?next=/pricing");
      else toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <MarketingNav />
      <main className="section-shell pricing-page">
        <div className="section-intro">
          <span className="eyebrow">
            YOUR PLANS. A WORLD OF POSSIBILITY.
          </span>
          <h1>
            Start free.
            <br />
            Keep the good trips coming.
          </h1>
          <p>
            Your first trip has everything you need.
            <br />
            Subscribe when you’re ready for somewhere new.
          </p>
        </div>
        <PriceCards />
        <div className="subscribe-controls">
          <Button
            loading={busy === "monthly"}
            onClick={() => subscribe("monthly")}
          >
            Choose monthly · €5
          </Button>
          <Button
            variant="secondary"
            loading={busy === "annual"}
            onClick={() => subscribe("annual")}
          >
            Choose annual · €40
          </Button>
        </div>
        {config.data && !config.data.payments && (
          <Notice>
            Subscriptions aren’t available for purchase yet. Your first free
            trip is ready to plan.
          </Notice>
        )}
        <div className="pricing-details">
          <h2>No unpleasant surprises.</h2>
          <p>
            Destinations are confirmed and locked when a trip is created. Dates
            remain adjustable until departure. Cancelling your subscription
            keeps your existing trips editable and exportable.
          </p>
          <p>
            Your first trip includes 10 successful menu imports. An active
            subscription includes 30 per month, including on the annual plan.
            Failed imports don’t count; unused monthly imports don’t roll over.
            Shared free service allowances may occasionally delay automatic
            processing.
          </p>
          <p>
            Travel bookings are purchased from external providers. Your Whereto
            subscription pays for this planner. Applicable taxes are shown
            before checkout.
          </p>
          <Link to="/terms">Read the terms</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
