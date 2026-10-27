import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Receipt } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Logo, Doodle, type DoodleName } from "../components/Doodle";
import { Button, Notice } from "../components/ui";
import { api, post, ApiError } from "../lib/api";
import "./billing-outcome.css";

type Outcome = {
  status: "active" | "confirming" | "processing" | "open" | "expired";
  plan: "month" | "year" | null;
  amountTotal: number | null;
  currency: string | null;
  email: string | null;
  paidUntil: string | null;
  cancelAtPeriodEnd: boolean;
  invoiceNumber: string | null;
  invoiceUrl: string | null;
  invoicePdf: string | null;
};
// About 30 seconds of checking while Stripe's confirmation reaches the server.
const MAX_CHECKS = 15;
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
const day = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { dateStyle: "long" });

function Shell({
  doodle,
  eyebrow,
  title,
  lead,
  children,
}: {
  doodle: DoodleName;
  eyebrow: string;
  title: string;
  lead: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="auth-layout billing-outcome">
      <aside className="auth-art">
        <Link to="/">
          <Logo />
        </Link>
        <div>
          <Doodle name={doodle} flow />
          <h1>
            Your next adventure
            <br />
            starts with you.
          </h1>
          <p>Lovely plans. Clear budgets.</p>
        </div>
        <span>Payments are handled securely by Stripe.</span>
      </aside>
      <main className="auth-main">
        <Link to="/app" className="text-link back-link">
          <ArrowLeft size={18} /> Back to your trips
        </Link>
        <div className="auth-form" aria-live="polite">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="muted">{lead}</p>
          {children}
        </div>
      </main>
    </div>
  );
}

function Canceled() {
  const [params] = useSearchParams();
  const plan = params.get("plan") === "annual" ? "annual" : "monthly";
  const [busy, setBusy] = useState(false);
  return (
    <Shell
      doodle="map"
      eyebrow="CHECKOUT CANCELED"
      title="No charge was made."
      lead="You left checkout before paying, so nothing changed on your account. Your trips are right where you left them."
    >
      <div className="billing-outcome-actions">
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { url } = await post("/billing/checkout", { plan });
              window.location.assign(url);
            } catch (e) {
              toast.error((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Retry {plan} plan <ArrowUpRight size={18} />
        </Button>
        <Link className="button button-secondary" to="/pricing">
          Compare plans
        </Link>
      </div>
    </Shell>
  );
}

function Details({ outcome }: { outcome: Outcome }) {
  return (
    <dl className="billing-outcome-details">
      {outcome.plan && (
        <div>
          <dt>Plan</dt>
          <dd>
            Whereto Plus · {outcome.plan === "year" ? "Annual" : "Monthly"}
          </dd>
        </div>
      )}
      {outcome.amountTotal != null && outcome.currency && (
        <div>
          <dt>Paid today</dt>
          <dd>{money(outcome.amountTotal, outcome.currency)}</dd>
        </div>
      )}
      {outcome.paidUntil && (
        <div>
          <dt>{outcome.cancelAtPeriodEnd ? "Access until" : "Renews on"}</dt>
          <dd>{day(outcome.paidUntil)}</dd>
        </div>
      )}
      {outcome.email && (
        <div>
          <dt>Receipt sent to</dt>
          <dd>{outcome.email}</dd>
        </div>
      )}
    </dl>
  );
}

export default function BillingOutcome() {
  const location = useLocation();
  const [params] = useSearchParams();
  const client = useQueryClient();
  const canceled = location.pathname.endsWith("/canceled");
  const sessionId = params.get("session_id") ?? "";
  const outcome = useQuery({
    queryKey: ["checkout-outcome", sessionId],
    queryFn: () =>
      api<Outcome>(`/billing/checkout/${encodeURIComponent(sessionId)}`),
    enabled: !canceled && !!sessionId,
    retry: false,
    refetchInterval: (query) =>
      ["confirming", "processing"].includes(query.state.data?.status ?? "") &&
      query.state.dataUpdateCount < MAX_CHECKS
        ? 2000
        : false,
  });
  const status = outcome.data?.status;
  useEffect(() => {
    if (status === "active")
      void client.invalidateQueries({ queryKey: ["me"] });
  }, [status, client]);

  if (canceled) return <Canceled />;
  if (
    !sessionId ||
    (outcome.error instanceof ApiError && outcome.error.status === 404)
  )
    return (
      <Shell
        doodle="sun"
        eyebrow="CHECKOUT"
        title="We couldn’t find this checkout."
        lead="The link may be incomplete or belong to another account. If you were charged, your receipt from Stripe has the details."
      >
        <div className="billing-outcome-actions">
          <Link
            className="button button-primary"
            to="/app/settings?section=billing"
          >
            Check my plan <ArrowUpRight size={18} />
          </Link>
          <Link className="button button-secondary" to="/pricing">
            See plans
          </Link>
        </div>
      </Shell>
    );
  if (outcome.error instanceof ApiError && outcome.error.status === 401)
    return (
      <Shell
        doodle="suitcase"
        eyebrow="CHECKOUT"
        title="Sign in to see your payment."
        lead="For your privacy, payment details are only shown to the account that paid."
      >
        <Link
          className="button button-primary full-width"
          to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`}
        >
          Sign in <ArrowUpRight size={18} />
        </Link>
      </Shell>
    );
  if (outcome.error)
    return (
      <Shell
        doodle="sun"
        eyebrow="CHECKOUT"
        title="We couldn’t check your payment."
        lead="Your payment is safe with Stripe. This page just couldn’t reach it."
      >
        <Notice error>{outcome.error.message}</Notice>
        <Button onClick={() => void outcome.refetch()}>Try again</Button>
      </Shell>
    );
  if (!outcome.data)
    return (
      <Shell
        doodle="train"
        eyebrow="CHECKOUT"
        title="One moment…"
        lead={
          <span role="status" className="billing-outcome-pending">
            <span className="billing-outcome-dot" aria-hidden="true" />
            Checking your payment with Stripe
          </span>
        }
      />
    );

  const data = outcome.data;
  const checks =
    client.getQueryState(["checkout-outcome", sessionId])?.dataUpdateCount ?? 0;
  const gaveUp = !outcome.isFetching && checks >= MAX_CHECKS;
  if (data.status === "active")
    return (
      <Shell
        doodle="plane"
        eyebrow="PAYMENT SUCCESSFUL"
        title="You’re all set."
        lead="Thank you! Whereto Plus is active. There’s room for as many new journeys as you like."
      >
        <Details outcome={data} />
        <div className="billing-outcome-actions">
          <Link className="button button-primary" to="/app/new">
            Plan a new trip <ArrowUpRight size={18} />
          </Link>
          {data.invoiceUrl && (
            <a
              className="button button-secondary"
              href={data.invoiceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Receipt size={18} /> View receipt
            </a>
          )}
        </div>
        <p className="fine-print">
          Invoices, payment methods and cancellation are in{" "}
          <Link to="/app/settings?section=billing">Plan &amp; billing</Link>.
        </p>
      </Shell>
    );
  if (data.status === "confirming" || data.status === "processing")
    return (
      <Shell
        doodle="train"
        eyebrow={
          data.status === "processing"
            ? "PAYMENT PROCESSING"
            : "PAYMENT RECEIVED"
        }
        title={
          data.status === "processing"
            ? "Your payment is on its way."
            : "Unlocking your plan…"
        }
        lead={
          data.status === "processing"
            ? "Some payment methods take a few days to confirm. We’ll unlock Whereto Plus as soon as your bank confirms. You won’t be charged twice."
            : "Stripe has your payment. We’re confirming it now. This usually takes a few seconds."
        }
      >
        {!gaveUp ? (
          <p role="status" className="billing-outcome-pending">
            <span className="billing-outcome-dot" aria-hidden="true" />
            {outcome.isFetching
              ? "Checking again…"
              : "Waiting for confirmation"}
          </p>
        ) : (
          <Notice>
            This is taking longer than usual. You can leave this page; your plan
            unlocks automatically once Stripe confirms.
          </Notice>
        )}
        <Details outcome={data} />
        <div className="billing-outcome-actions">
          {gaveUp && (
            <Button variant="secondary" onClick={() => void outcome.refetch()}>
              Check again
            </Button>
          )}
          <Link className="button button-secondary" to="/app">
            Back to my trips
          </Link>
        </div>
      </Shell>
    );
  return (
    <Shell
      doodle="map"
      eyebrow={
        data.status === "expired" ? "CHECKOUT EXPIRED" : "CHECKOUT NOT FINISHED"
      }
      title={
        data.status === "expired"
          ? "This checkout expired."
          : "This checkout isn’t finished."
      }
      lead="No payment was taken. You can start again whenever you’re ready."
    >
      <div className="billing-outcome-actions">
        <Link className="button button-primary" to="/pricing">
          Choose a plan <ArrowUpRight size={18} />
        </Link>
      </div>
    </Shell>
  );
}
