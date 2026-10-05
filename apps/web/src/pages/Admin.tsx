import { useEffect, useState, useRef, type ReactNode } from "react";
import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bell,
  ChartBar,
  Users,
  MapTrifold,
  CreditCard,
  Queue,
  Plugs,
  ClockCounterClockwise,
  LockKey,
  ArrowLeft,
  MagnifyingGlass,
  Check,
  WarningCircle,
} from "@phosphor-icons/react";
import QRCode from "react-qr-code";
import { api, post, authClient, ApiError } from "../lib/api";
import { Logo, Doodle } from "../components/Doodle";
import { Button, Field, Modal, Notice } from "../components/ui";
import { Select, SelectOption } from "../components/Select";
import {
  MotionGroup,
  MotionSelection,
  MotionPanel,
  Disclosure,
} from "../components/motion";
import "./admin.css";

type Row = Record<string, any>;
type Action = {
  action: string;
  target: string;
  label: string;
  kind?: "trip" | "menu";
  quantity?: number;
  maximum?: number;
  paused?: boolean;
  limit?: number;
  balance?: number;
};
const sections = [
  { path: "", title: "Overview", icon: ChartBar },
  { path: "users", title: "Users", icon: Users },
  { path: "trips", title: "Trips", icon: MapTrifold },
  { path: "subscriptions", title: "Subscriptions", icon: CreditCard },
  { path: "jobs", title: "Jobs", icon: Queue },
  { path: "integrations", title: "Integrations", icon: Plugs },
  { path: "activity", title: "Activity log", icon: ClockCounterClockwise },
];
const date = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not recorded";
const number = (n: number) => new Intl.NumberFormat("en-GB").format(n);
const labels: Record<string, string> = {
  account_created: "Account created",
  email_verified: "Email verified",
  first_trip: "First trip",
  first_item: "First item",
  first_cost: "First cost",
  first_export: "First export",
};
function useVisible() {
  const [visible, setVisible] = useState(
    document.visibilityState === "visible",
  );
  useEffect(() => {
    const change = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  return visible;
}
function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`admin-tag ${tone}`}>{children}</span>;
}
function Empty({ text = "Nothing here yet." }: { text?: string }) {
  return (
    <div className="admin-empty">
      <Doodle name="sun" />
      <h3>{text}</h3>
      <p>Real activity will appear here as people use Whereto.</p>
    </div>
  );
}

function Verification({
  onVerified,
  enrolled = true,
  passwordRequired = false,
}: {
  onVerified: () => void;
  enrolled?: boolean;
  passwordRequired?: boolean;
}) {
  const [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [setup, setSetup] = useState<Row | null>(null),
    [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="admin-verification">
      <LockKey size={32} />
      <h2>
        {enrolled || setup
          ? "Your authenticator, please."
          : "Set up your admin key."}
      </h2>
      <p>
        {enrolled
          ? "A six-digit code opens this admin session. Sensitive changes require a code verified in the last 10 minutes."
          : "Use an authenticator app on your phone. Setup details stay on this screen and are never sent to a QR service."}
      </p>
      {setup && (
        <div className="admin-setup">
          <QRCode value={setup.totpURI} size={180} />
          <p>
            Scan this QR code, then save your backup codes somewhere private.
          </p>
          <div className="admin-backup">
            {setup.backupCodes.map((c: string) => (
              <code key={c}>{c}</code>
            ))}
          </div>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />{" "}
            I saved my backup codes
          </label>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            if (!enrolled && !setup) {
              setSetup(
                await post("/admin/access/enroll", {
                  ...(password ? { password } : {}),
                }),
              );
              setPassword("");
            } else {
              if (setup) {
                const r = await authClient.twoFactor.verifyTotp({ code });
                if (r.error) throw new Error(r.error.message);
              }
              await post("/admin/access/verify", { code });
              setCode("");
              setSetup(null);
              onVerified();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {!enrolled && !setup ? (
          passwordRequired && (
            <Field label="Current password">
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Field>
          )
        ) : (
          <Field label="Authenticator code">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </Field>
        )}
        {error && <Notice error>{error}</Notice>}
        <Button type="submit" loading={busy} disabled={!!setup && !saved}>
          {!enrolled && !setup ? "Set up authenticator" : "Verify code"}
        </Button>
      </form>
    </div>
  );
}

function AdminTable({
  columns,
  rows,
  render,
}: {
  columns: string[];
  rows: Row[];
  render: (row: Row) => ReactNode;
}) {
  if (!rows.length) return <Empty />;
  return (
    <div
      className="admin-table-wrap"
      role="region"
      aria-label="Results"
      tabIndex={0}
    >
      <table className="admin-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th scope="col" key={c}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? r.userId}>{render(r)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Id({ value }: { value: string }) {
  return (
    <code className="admin-id" title={value}>
      {value}
    </code>
  );
}

function Overview({ data }: { data: Row }) {
  const days = Array.from({ length: data.days }, (_, i) =>
    new Date(Date.now() - (data.days - 1 - i) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const points = days.map((day) => ({
    day,
    menu:
      data.trend.find((r: Row) => r.day === day && r.type === "menu")?.total ??
      0,
    export:
      data.trend.find((r: Row) => r.day === day && r.type === "export")
        ?.total ?? 0,
  }));
  const max = Math.max(1, ...points.flatMap((p) => [p.menu, p.export]));
  const path = (type: "menu" | "export") =>
    points
      .map(
        (p, i) =>
          `${i ? "L" : "M"}${35 + (i * 510) / Math.max(1, points.length - 1)},${170 - (p[type] / max) * 135}`,
      )
      .join(" ");
  return (
    <>
      <section
        className="admin-panel admin-attention"
        aria-labelledby="attention-title"
      >
        <div className="admin-panel-title">
          <h2 id="attention-title">Needs attention</h2>
          <Tag tone={data.attention.length ? "warning" : "good"}>
            {data.attention.length
              ? `${data.attention.length} to review`
              : "All clear"}
          </Tag>
        </div>
        {data.attention.length ? (
          data.attention.map((a: Row) => (
            <Link className="admin-alert" to={a.href} key={a.title}>
              <WarningCircle size={22} />
              <span>
                <strong>{a.title}</strong>
                <small>{a.detail}</small>
              </span>
              <ArrowUpRight size={19} />
            </Link>
          ))
        ) : (
          <p className="admin-all-clear">
            <Check size={21} /> No operational alerts right now. Unconfigured
            services are listed in Integrations.
          </p>
        )}
      </section>
      <section className="admin-metrics" aria-label="Key metrics">
        {[
          [
            "Verified users",
            data.metrics.verifiedUsers,
            data.definitions.verifiedUsers,
          ],
          [
            "Trips created",
            data.metrics.tripsCreated,
            data.definitions.tripsCreated,
          ],
          [
            "Active subscriptions",
            data.metrics.activeSubscriptions,
            data.definitions.activeSubscriptions,
          ],
          [
            "Estimated MRR",
            `€${data.metrics.estimatedMrr.toFixed(2)}`,
            data.definitions.estimatedMrr,
          ],
        ].map(([title, value, definition]) => (
          <article key={title}>
            <span>{title}</span>
            <strong>{typeof value === "number" ? number(value) : value}</strong>
            <small>{definition}</small>
          </article>
        ))}
      </section>
      {data.metrics.mrrMissingPlans > 0 && (
        <Notice>
          {data.metrics.mrrMissingPlans} active plans have no known price and
          are excluded from estimated MRR.
        </Notice>
      )}
      <div className="admin-chart-grid">
        <section className="admin-panel">
          <div className="admin-panel-title">
            <h2>From hello to a first trip</h2>
          </div>
          <p className="admin-caption">{data.definitions.funnel}</p>
          <div className="admin-funnel">
            {data.funnel.map((f: Row) => (
              <div key={f.event}>
                <span>{labels[f.event]}</span>
                <div className="admin-bar-track">
                  <div
                    style={{
                      width: `${(f.count / Math.max(1, data.funnel[0].count)) * 100}%`,
                    }}
                  />
                </div>
                <strong>{number(f.count)}</strong>
              </div>
            ))}
          </div>
          <small className="admin-caption">
            Tracking observed since {date(data.trackingSince)}. Earlier events
            are unavailable.
          </small>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-title">
            <h2>Imports & exports</h2>
            <span className="admin-chart-legend">
              <i /> Menus <i /> Exports
            </span>
          </div>
          <p className="admin-caption">{data.definitions.trend}</p>
          {data.trend.length ? (
            <>
              <svg
                viewBox="0 0 570 200"
                role="img"
                aria-label={`Operations created over ${data.days} days. The exact counts are in the table below.`}
              >
                <path d="M35 30V170H545" stroke="#dcd7ca" fill="none" />
                <text x="10" y="38" fontSize="11" fill="currentColor">
                  {max}
                </text>
                <text x="15" y="174" fontSize="11" fill="currentColor">
                  0
                </text>
                <path
                  d={path("menu")}
                  stroke="#b86f63"
                  strokeWidth="3"
                  fill="none"
                  strokeLinejoin="round"
                />
                <path
                  d={path("export")}
                  stroke="#547b64"
                  strokeWidth="3"
                  fill="none"
                  strokeLinejoin="round"
                />
                <text x="35" y="194" fontSize="11">
                  {days[0]}
                </text>
                <text x="470" y="194" fontSize="11">
                  {days.at(-1)}
                </text>
              </svg>
              <Disclosure className="admin-chart-data">
                <summary>View exact counts</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Menus</th>
                      <th>Exports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {points.map((p) => (
                      <tr key={p.day}>
                        <td>{p.day}</td>
                        <td>{p.menu}</td>
                        <td>{p.export}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Disclosure>
            </>
          ) : (
            <Empty text="No operations in this period." />
          )}
        </section>
      </div>
      <p className="admin-caption">
        Worker:{" "}
        {data.worker.available ? "heartbeat received" : "heartbeat unavailable"}{" "}
        · Last seen {date(data.worker.seenAt)}. {data.metrics.failedJobs} failed
        operations in this period.
      </p>
    </>
  );
}

function actionExplanation(a: Action, quantity: number, limit: number) {
  switch (a.action) {
    case "grant":
      return `Add ${quantity} ${a.kind === "trip" ? "new-trip" : "menu-import"} credits to this account. They do not expire. Normal free/subscription allowances are used first. The lifetime free-trip claim will stay unchanged.`;
    case "revoke-credit":
      return `Remove ${quantity} unused credits from this grant. Consumed credits and existing trips will stay unchanged.`;
    case "suspend":
      return "Suspend this account and revoke its sessions. Access to its owned trips, including collaborator access and public links, will be blocked. Data stays saved. Its Stripe subscription will NOT be canceled; billing continues until changed in Stripe.";
    case "reactivate":
      return "Restore account access and access through existing trip invitations and public links. Old sessions remain revoked. Subscription status stays unchanged.";
    case "revoke-sessions":
      return "Sign this account out on all devices. It can sign in again. Trip data and subscriptions stay unchanged.";
    case "retry":
      return "Queue another attempt for this failed job. Original permissions, source checks and quotas still apply. Completed results are reused; an import is charged only once.";
    case "resync":
    case "resync-event":
      return "Read this account’s current subscription from Stripe and refresh its effective access. This does not create a payment, refund or subscription.";
    default:
      return `${a.paused == null ? `Set the application allowance to ${number(limit)}, within the server maximum.` : a.paused ? "Pause new requests and new job starts for this service." : "Resume new requests and waiting job starts for this service."} In-flight requests may finish. Saved data and manual planning remain available. No paid upgrade is enabled.`;
  }
}

function ActionDialog({
  action: a,
  close,
  completed,
  restoreFocus,
}: {
  action: Action | null;
  close: () => void;
  completed: () => void;
  restoreFocus: (e: Event) => void;
}) {
  const [reason, setReason] = useState(""),
    [quantity, setQuantity] = useState(1),
    [limit, setLimit] = useState(0),
    [review, setReview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [stepUp, setStepUp] = useState(false),
    [key, setKey] = useState(crypto.randomUUID());
  useEffect(() => {
    setReason("");
    setQuantity(a?.quantity ?? 1);
    setLimit(a?.limit ?? 0);
    setReview(false);
    setBusy(false);
    setError("");
    setStepUp(false);
    setKey(crypto.randomUUID());
  }, [a]);
  return (
    <Modal
      open={!!a}
      onCloseAutoFocus={restoreFocus}
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
      title={a?.label ?? "Review change"}
      description="Every intervention is recorded in the activity log."
    >
      {a &&
        (stepUp ? (
          <Verification
            onVerified={() => {
              setStepUp(false);
              setError("");
            }}
          />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!review) {
                setReview(true);
                return;
              }
              setBusy(true);
              setError("");
              try {
                const result = await post(
                  `/admin/actions/${a.action}/${encodeURIComponent(a.target)}`,
                  {
                    requestKey: key,
                    reason,
                    ...(["grant", "revoke-credit"].includes(a.action)
                      ? { quantity }
                      : {}),
                    ...(a.kind ? { kind: a.kind } : {}),
                    ...(a.paused != null ? { paused: a.paused } : {}),
                    ...(a.action === "integration" && a.paused == null
                      ? { limit }
                      : {}),
                  },
                );
                if (result.outcome !== "success") {
                  setKey(crypto.randomUUID());
                  throw new Error(
                    "The previous attempt failed. Review the current state and try again.",
                  );
                }
                completed();
                close();
              } catch (e) {
                if (
                  e instanceof ApiError &&
                  ["ADMIN_STEP_UP", "ADMIN_TOTP_REQUIRED"].includes(
                    e.code ?? "",
                  )
                )
                  setStepUp(true);
                else {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "The change could not be completed.",
                  );
                  if (e instanceof ApiError && e.status < 500)
                    setKey(crypto.randomUUID());
                }
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="admin-target">
              Target <Id value={a.target} />
            </p>
            {!review && (
              <>
                {["grant", "revoke-credit"].includes(a.action) && (
                  <Field label="Quantity">
                    <input
                      type="number"
                      min={1}
                      max={a.maximum ?? 1000}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      required
                    />
                  </Field>
                )}
                {a.action === "integration" && a.paused == null && (
                  <Field
                    label="Application allowance"
                    hint={`Server maximum: ${number(a.maximum ?? 0)}`}
                  >
                    <input
                      type="number"
                      min={0}
                      max={a.maximum}
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                      required
                    />
                  </Field>
                )}
                <Field
                  label="Reason"
                  hint="Use an operational reason. Do not paste passwords, private trip content or payment details."
                >
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={5}
                    maxLength={500}
                    rows={3}
                    required
                  />
                </Field>
              </>
            )}
            <div className="admin-review">
              <h3>
                {review ? "Confirm this exact change" : "What will happen"}
              </h3>
              <p>{actionExplanation(a, quantity, limit)}</p>
              {review && (
                <p>
                  <strong>Reason:</strong> {reason}
                </p>
              )}
            </div>
            {error && <Notice error>{error}</Notice>}
            <div className="admin-form-actions">
              {review && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setReview(false)}
                  disabled={busy}
                >
                  Edit details
                </Button>
              )}
              <Button type="submit" loading={busy}>
                {review ? "Confirm change" : "Review change"}
              </Button>
            </div>
          </form>
        ))}
    </Modal>
  );
}

export default function Admin() {
  const visible = useVisible(),
    client = useQueryClient(),
    navigate = useNavigate(),
    location = useLocation();
  const [params, setParams] = useSearchParams();
  const page = location.pathname.replace(/^\/admin\/?/, "") || "overview";
  const section = sections.find((s) => (s.path || "overview") === page);
  const [search, setSearch] = useState(params.get("q") ?? ""),
    [action, setAction] = useState<Action | null>(null),
    [userId, setUserId] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const actionTrigger = useRef<HTMLElement | null>(null);
  const openAction = (next: Action) => {
    actionTrigger.current = document.activeElement as HTMLElement;
    setAction(next);
  };
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);
  const access = useQuery({
    queryKey: ["admin-access"],
    queryFn: () => api<Row>("/admin/access"),
    retry: false,
    refetchOnWindowFocus: true,
    enabled: visible,
  });
  const data = useQuery({
    queryKey: ["admin", page, params.toString()],
    queryFn: () => api<Row>(`/admin/${page}?${params}`),
    enabled: !!access.data?.verified && visible && !!section,
    retry: false,
    refetchInterval: visible ? 30000 : false,
  });
  const alerts = useQuery({
    queryKey: ["admin", "alerts"],
    queryFn: () => api<Row>("/admin/overview?days=30"),
    enabled: !!access.data?.verified && visible && page !== "overview",
    retry: false,
    refetchInterval: visible ? 30000 : false,
  });
  const user = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => api<Row>(`/admin/users/${encodeURIComponent(userId!)}`),
    enabled: !!access.data?.verified && !!userId && visible,
    retry: false,
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["admin"] });
    void client.invalidateQueries({ queryKey: ["admin-access"] });
    setNotice("Change recorded in the activity log.");
  };
  const filter = (key: string, value: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    });
  const verified = () => {
    void access.refetch();
    void client.invalidateQueries({ queryKey: ["admin"] });
  };
  const denied =
    access.error instanceof ApiError && access.error.status === 403;
  if (
    !access.data?.verified ||
    access.error ||
    (data.error instanceof ApiError && [401, 403].includes(data.error.status))
  )
    return (
      <main className="admin-gate">
        <Link to="/">
          <Logo />
        </Link>
        <div className="admin-gate-body">
          <Tag>PRIVATE WORKSPACE</Tag>
          {access.isPending ? (
            <p role="status">Checking admin access…</p>
          ) : denied ? (
            <>
              <h1>This workspace is private.</h1>
              <p>
                Admin is available only to the verified owner account configured
                on this server.
              </p>
              <Link className="button button-primary" to="/app">
                Back to your trips
              </Link>
            </>
          ) : access.error ? (
            <>
              <h1>Welcome to Whereto Admin.</h1>
              <p>Sign in with your verified owner account to continue.</p>
              <Link className="button button-primary" to="/login?next=%2Fadmin">
                Sign in
              </Link>
            </>
          ) : (
            <Verification
              enrolled={access.data?.enrolled}
              passwordRequired={access.data?.passwordRequired}
              onVerified={verified}
            />
          )}
        </div>
      </main>
    );
  const rows = data.data?.rows ?? [];
  const activeAlerts =
    page === "overview" ? data.data?.attention : alerts.data?.attention;
  return (
    <div className="admin-layout">
      <a className="admin-skip" href="#admin-main">
        Skip to admin content
      </a>
      <aside className="admin-sidebar">
        <Link to="/" aria-label="Whereto home">
          <Logo />
        </Link>
        <span className="admin-workspace-label">YOUR CONTROL ROOM</span>
        <nav aria-label="Admin navigation">
          <MotionGroup>
            {sections.map((s) => (
              <NavLink
                key={s.path}
                to={`/admin${s.path ? "/" + s.path : ""}`}
                end
                className={({ isActive }) =>
                  `motion-nav-link ${isActive ? "active" : ""}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && <MotionSelection />}
                    <s.icon size={20} />
                    <span>{s.title}</span>
                  </>
                )}
              </NavLink>
            ))}
          </MotionGroup>
        </nav>
        <div className="admin-sidebar-bottom">
          <Doodle name="train" />
          <p>
            Thoughtful care.
            <br />A smoother journey.
          </p>
          <Link to="/app">
            <ArrowLeft size={16} /> Back to the app
          </Link>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <Tag
            tone={access.data.environment === "production" ? "warning" : "good"}
          >
            {access.data.environment.toUpperCase()}
          </Tag>
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (["overview", "integrations"].includes(page))
                navigate(`/admin/users?q=${encodeURIComponent(search)}`);
              else filter("q", search);
            }}
          >
            <MagnifyingGlass size={19} />
            <input
              aria-label="Search email or ID"
              placeholder="Search email or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit" aria-label="Search">
              <ArrowUpRight size={18} />
            </button>
          </form>
          <Link
            to="/admin"
            className="admin-alert-button"
            aria-label={`${activeAlerts?.length ?? 0} operational alerts`}
          >
            <Bell size={21} />
            <span>{activeAlerts?.length ?? "—"}</span>
          </Link>
        </header>
        <main id="admin-main" tabIndex={-1} className="admin-main">
          <MotionPanel changeKey={page} distance={8}>
            <div className="admin-page-heading">
              <div>
                <span className="eyebrow">WHERETO ADMIN</span>
                <h1>{section?.title ?? "Page not found"}</h1>
                <p>
                  {page === "overview"
                    ? "A clear view of what needs your care."
                    : page === "integrations"
                      ? "Service controls, free allowances and honest availability."
                      : "Operational data only. Private trip content stays private."}
                </p>
              </div>
              {["overview", "activity"].includes(page) && (
                <Field label="Period">
                  <Select
                    aria-label="Period"
                    value={params.get("days") ?? "30"}
                    onValueChange={(v) => filter("days", v)}
                  >
                    {[7, 30, 90].map((d) => (
                      <SelectOption key={d} value={String(d)}>
                        Last {d} days
                      </SelectOption>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
            {notice && (
              <div className="admin-toast" role="status">
                {notice}
                <button
                  aria-label="Dismiss message"
                  onClick={() => setNotice("")}
                >
                  ×
                </button>
              </div>
            )}
            {!section ? (
              <Link to="/admin">Back to overview</Link>
            ) : data.isPending ? (
              <div className="admin-loading" role="status">
                Bringing the latest activity together…
              </div>
            ) : data.error ? (
              <Notice error>
                {data.error.message}
                <Button variant="ghost" onClick={() => void data.refetch()}>
                  Try again
                </Button>
              </Notice>
            ) : (
              data.data && (
                <>
                  {["users", "subscriptions", "jobs", "activity"].includes(
                    page,
                  ) && (
                    <div className="admin-filters">
                      <Field label={page === "activity" ? "Action" : "Status"}>
                        <Select
                          value={params.get("status") ?? ""}
                          onValueChange={(v) => filter("status", v)}
                        >
                          <SelectOption value="">
                            All {page === "activity" ? "actions" : "statuses"}
                          </SelectOption>
                          {(page === "users"
                            ? ["suspended"]
                            : page === "subscriptions"
                              ? [
                                  "active",
                                  "trialing",
                                  "past_due",
                                  "canceled",
                                  "unpaid",
                                  "expired",
                                  "canceling",
                                ]
                              : page === "jobs"
                                ? [
                                    "queued",
                                    "processing",
                                    "waiting",
                                    "completed",
                                    "failed",
                                  ]
                                : [
                                    "grant",
                                    "revoke-credit",
                                    "suspend",
                                    "reactivate",
                                    "revoke-sessions",
                                    "retry",
                                    "integration",
                                    "resync",
                                    "resync-event",
                                    "admin.verify",
                                  ]
                          ).map((s) => (
                            <SelectOption key={s} value={s}>
                              {s.replaceAll("-", " ")}
                            </SelectOption>
                          ))}
                        </Select>
                      </Field>
                      {page === "subscriptions" && (
                        <Field label="Plan">
                          <Select
                            value={params.get("plan") ?? ""}
                            onValueChange={(v) => filter("plan", v)}
                          >
                            <SelectOption value="">All plans</SelectOption>
                            <SelectOption value="month">Monthly</SelectOption>
                            <SelectOption value="year">Annual</SelectOption>
                          </Select>
                        </Field>
                      )}
                      {(params.get("q") || params.get("user")) && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setParams({});
                            setSearch("");
                          }}
                        >
                          Clear filters
                        </Button>
                      )}
                      <span>{data.data.total} results</span>
                    </div>
                  )}
                  {page === "overview" && <Overview data={data.data} />}
                  {page === "users" && (
                    <AdminTable
                      columns={[
                        "Account",
                        "Access",
                        "Trips",
                        "Menu allowance",
                        "",
                      ]}
                      rows={rows}
                      render={(u) => (
                        <>
                          <td>
                            <button
                              className="admin-text-button"
                              onClick={() => setUserId(u.id)}
                            >
                              {u.email}
                            </button>
                            <Id value={u.id} />
                            <small>Joined {date(u.createdAt)}</small>
                          </td>
                          <td>
                            <Tag
                              tone={
                                u.suspendedAt
                                  ? "warning"
                                  : u.verified
                                    ? "good"
                                    : "neutral"
                              }
                            >
                              {u.suspendedAt
                                ? "Suspended"
                                : u.verified
                                  ? "Verified"
                                  : "Unverified"}
                            </Tag>
                            <small>
                              {u.subscription?.appAccess
                                ? "Subscription active"
                                : "No active subscription"}
                            </small>
                          </td>
                          <td>
                            <Link to={`/admin/trips?user=${u.id}`}>
                              {u.trips} trips ↗
                            </Link>
                            <small>
                              {u.freeTripClaimedAt
                                ? "Free trip claimed"
                                : "Free trip unclaimed"}
                            </small>
                            <small>{u.tripCredits} bonus trip credits</small>
                          </td>
                          <td>
                            {u.menuAllowance.normalRemaining} normal +{" "}
                            {u.menuAllowance.bonus} bonus
                            <small>
                              {u.menuAllowance.used} / {u.menuAllowance.limit}{" "}
                              normal used
                            </small>
                          </td>
                          <td>
                            <Button
                              variant="secondary"
                              onClick={() => setUserId(u.id)}
                            >
                              Manage
                            </Button>
                          </td>
                        </>
                      )}
                    />
                  )}
                  {page === "trips" && (
                    <AdminTable
                      columns={[
                        "Trip",
                        "Owner",
                        "Funding",
                        "Contents",
                        "Locks",
                        "",
                      ]}
                      rows={rows}
                      render={(t) => (
                        <>
                          <td>
                            <Id value={t.id} />
                            <small>Created {date(t.createdAt)}</small>
                            <small>Updated {date(t.updatedAt)}</small>
                            {t.archivedAt && <Tag>Archived</Tag>}
                          </td>
                          <td>
                            <button
                              className="admin-text-button"
                              onClick={() => setUserId(t.ownerId)}
                            >
                              {t.ownerEmail}
                            </button>
                          </td>
                          <td>
                            <Tag tone={t.funding === "bonus" ? "blue" : "good"}>
                              {t.funding}
                            </Tag>
                          </td>
                          <td>
                            {t.items} items
                            <small>
                              {t.collaborators} collaborators · {t.documents}{" "}
                              documents
                            </small>
                          </td>
                          <td>
                            <Tag>Destinations locked</Tag>
                            <small>
                              {t.datesLocked
                                ? "Period locked"
                                : "Period editable before departure"}
                            </small>
                          </td>
                          <td>
                            <Link
                              className="admin-text-button"
                              to={`/admin/jobs?q=${t.id}`}
                            >
                              Related jobs ↗
                            </Link>
                          </td>
                        </>
                      )}
                    />
                  )}
                  {page === "subscriptions" && (
                    <>
                      <Notice>
                        Estimated MRR is shown in Overview.{" "}
                        {data.data.receipts.note} Existing trips remain editable
                        and exportable after cancellation.
                      </Notice>
                      <AdminTable
                        columns={[
                          "Account",
                          "Stripe state",
                          "Effective access",
                          "Last sync",
                          "",
                        ]}
                        rows={rows}
                        render={(s) => (
                          <>
                            <td>
                              {s.email}
                              <Id value={s.userId} />
                              <small>
                                {s.interval === "year"
                                  ? "Annual"
                                  : s.interval === "month"
                                    ? "Monthly"
                                    : "Plan not recorded"}
                              </small>
                            </td>
                            <td>
                              <Tag>{s.stripeStatus}</Tag>
                              <small>
                                {s.cancelAtPeriodEnd
                                  ? "Cancellation scheduled"
                                  : "No scheduled cancellation"}
                              </small>
                              <small>
                                Latest invoice: {s.paymentStatus ?? "unknown"}
                              </small>
                            </td>
                            <td>
                              <Tag tone={s.appAccess ? "good" : "neutral"}>
                                {s.appAccess
                                  ? "New trips enabled"
                                  : "Existing trips only"}
                              </Tag>
                              <small>Paid through {date(s.paidUntil)}</small>
                            </td>
                            <td>{date(s.syncedAt)}</td>
                            <td>
                              <div className="admin-row-actions">
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    openAction({
                                      action: "resync",
                                      target: s.userId,
                                      label: "Resync subscription",
                                    })
                                  }
                                >
                                  Resync
                                </Button>
                                {s.customerUrl && (
                                  <a
                                    href={s.customerUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open Stripe ↗
                                  </a>
                                )}
                              </div>
                            </td>
                          </>
                        )}
                      />
                      {data.data.failedWebhooks.length > 0 && (
                        <section className="admin-panel">
                          <h2>Webhook failures</h2>
                          {data.data.failedWebhooks.map((e: Row) => (
                            <p key={e.id}>
                              <Id value={e.id} /> {e.type} · {e.error} ·{" "}
                              {e.attempts} attempts
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  openAction({
                                    action: "resync-event",
                                    target: e.id,
                                    label: "Retry webhook synchronization",
                                  })
                                }
                              >
                                Retry synchronization
                              </Button>
                            </p>
                          ))}
                        </section>
                      )}
                    </>
                  )}
                  {page === "jobs" && (
                    <>
                      <p className="admin-caption">
                        Old processing jobs are flagged for investigation. Age
                        alone never makes a job safe to retry.
                      </p>
                      <AdminTable
                        columns={[
                          "Operation",
                          "State",
                          "Timing",
                          "Diagnostic",
                          "",
                        ]}
                        rows={rows}
                        render={(j) => (
                          <>
                            <td>
                              <strong>
                                {j.type === "menu"
                                  ? "Menu import"
                                  : "Trip export"}
                              </strong>
                              <Id value={j.id} />
                              <small>
                                Trip <Id value={j.tripId} />
                              </small>
                            </td>
                            <td>
                              <Tag
                                tone={
                                  j.status === "failed"
                                    ? "warning"
                                    : j.status === "completed"
                                      ? "good"
                                      : "neutral"
                                }
                              >
                                {j.status}
                              </Tag>
                              <small>{j.attempts} attempts</small>
                              {j.stale && (
                                <Tag tone="warning">Needs investigation</Tag>
                              )}
                            </td>
                            <td>
                              {date(j.createdAt)}
                              <small>
                                {j.durationMs == null
                                  ? "Duration not yet recorded"
                                  : `${(j.durationMs / 1000).toFixed(1)} seconds`}
                              </small>
                            </td>
                            <td>
                              <span className="admin-error-copy">
                                {j.error ?? "No error recorded"}
                              </span>
                            </td>
                            <td>
                              {j.status === "failed" && (
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    openAction({
                                      action: "retry",
                                      target: j.id,
                                      label: "Retry failed operation",
                                    })
                                  }
                                >
                                  Retry
                                </Button>
                              )}
                            </td>
                          </>
                        )}
                      />
                    </>
                  )}
                  {page === "integrations" && (
                    <>
                      <Notice>
                        Usage is tracked or reserved by this application. It is
                        not the provider’s invoice. Configuration alone does not
                        prove live availability.
                      </Notice>
                      <div className="admin-integrations">
                        {rows.map((s: Row) => (
                          <section className="admin-panel" key={s.id}>
                            <div className="admin-panel-title">
                              <h2>{s.name}</h2>
                              <Tag
                                tone={
                                  !s.configured || s.paused
                                    ? "warning"
                                    : s.health === "available"
                                      ? "good"
                                      : "neutral"
                                }
                              >
                                {!s.configured
                                  ? "Not configured"
                                  : s.paused
                                    ? "Paused"
                                    : s.health === "unknown"
                                      ? "Not checked"
                                      : s.health}
                              </Tag>
                            </div>
                            <p className="admin-caption">
                              {s.mode ?? "External service"} ·{" "}
                              {s.configured ? "Configured" : "Unavailable"}
                            </p>
                            <div className="admin-usage">
                              <strong>{number(s.used)}</strong>
                              <span>
                                {" "}
                                / {number(s.limit)} {s.unit}
                              </span>
                            </div>
                            <progress
                              max={Math.max(1, s.limit)}
                              value={Math.min(s.used, s.limit || 1)}
                              aria-label={`${s.name} allowance used`}
                            />
                            <small>Resets {date(s.resetAt)}</small>
                            <small>
                              Last application check: {date(s.checkedAt)}
                            </small>
                            {s.error && (
                              <p className="admin-error-copy">{s.error}</p>
                            )}
                            <div className="admin-row-actions">
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  openAction({
                                    action: "integration",
                                    target: s.id,
                                    label: `${s.paused ? "Resume" : "Pause"} ${s.name}`,
                                    paused: !s.paused,
                                  })
                                }
                              >
                                {s.paused ? "Resume" : "Pause"}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() =>
                                  openAction({
                                    action: "integration",
                                    target: s.id,
                                    label: `${s.name} allowance`,
                                    limit: s.limit,
                                    maximum: s.max,
                                  })
                                }
                              >
                                Adjust allowance
                              </Button>
                            </div>
                          </section>
                        ))}
                      </div>
                    </>
                  )}
                  {page === "activity" && (
                    <>
                      <p className="admin-caption">
                        Permanent operational history. Entries cannot be edited
                        or deleted here.
                      </p>
                      <AdminTable
                        columns={[
                          "When / who",
                          "Intervention",
                          "Reason",
                          "Change",
                        ]}
                        rows={rows}
                        render={(a) => (
                          <>
                            <td>
                              {date(a.createdAt)}
                              <Id value={a.actorId} />
                            </td>
                            <td>
                              <strong>{a.action.replaceAll("-", " ")}</strong>
                              <Tag
                                tone={
                                  a.outcome === "success" ? "good" : "warning"
                                }
                              >
                                {a.outcome}
                              </Tag>
                              <Id value={a.targetId} />
                            </td>
                            <td>{a.reason}</td>
                            <td>
                              <pre className="admin-change">
                                {JSON.stringify(a.change, null, 2)}
                              </pre>
                            </td>
                          </>
                        )}
                      />
                    </>
                  )}
                  {data.data.total != null && data.data.total > 0 && (
                    <div className="admin-pagination">
                      <span>
                        Page {data.data.page} of{" "}
                        {Math.max(
                          1,
                          Math.ceil(data.data.total / data.data.pageSize),
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        disabled={data.data.page <= 1}
                        onClick={() =>
                          setParams((p) => {
                            const n = new URLSearchParams(p);
                            n.set("page", String(data.data!.page - 1));
                            return n;
                          })
                        }
                      >
                        Previous
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={
                          data.data.page * data.data.pageSize >= data.data.total
                        }
                        onClick={() =>
                          setParams((p) => {
                            const n = new URLSearchParams(p);
                            n.set("page", String(data.data!.page + 1));
                            return n;
                          })
                        }
                      >
                        Next
                      </Button>
                    </div>
                  )}
                  <footer className="admin-footnote">
                    Updates every 30 seconds while this page is visible. Last
                    loaded{" "}
                    {new Date(data.dataUpdatedAt).toLocaleTimeString("en-GB")}.
                  </footer>
                </>
              )
            )}
          </MotionPanel>
        </main>
      </div>
      <Modal
        open={!!userId}
        onOpenChange={(v) => {
          if (!v) setUserId(null);
        }}
        title="Account details"
        description="Operational access and compensation credits."
        wide
      >
        {user.isPending ? (
          <p>Loading account…</p>
        ) : user.error ? (
          <Notice error>{user.error.message}</Notice>
        ) : (
          user.data && (
            <div className="admin-user-detail">
              <h3>{user.data.email}</h3>
              <Id value={user.data.id} />
              <p>
                {user.data.verified ? "Email verified" : "Email unverified"} ·{" "}
                {user.data.freeTripClaimedAt
                  ? "Lifetime free trip already claimed"
                  : "Lifetime free trip not yet claimed"}
              </p>
              <div className="admin-row-actions">
                {(["menu", "trip"] as const).map((kind) => (
                  <Button
                    key={kind}
                    variant="secondary"
                    onClick={() =>
                      openAction({
                        action: "grant",
                        target: userId!,
                        label: `Grant ${kind} credits`,
                        kind,
                      })
                    }
                  >
                    Grant {kind} credits
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  onClick={() =>
                    openAction({
                      action: user.data!.suspendedAt ? "reactivate" : "suspend",
                      target: userId!,
                      label: user.data!.suspendedAt
                        ? "Reactivate account"
                        : "Suspend account",
                    })
                  }
                >
                  {user.data.suspendedAt ? "Reactivate" : "Suspend"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    openAction({
                      action: "revoke-sessions",
                      target: userId!,
                      label: "Revoke account sessions",
                    })
                  }
                >
                  Revoke sessions
                </Button>
              </div>
              <h3>Bonus credits</h3>
              <p className="admin-caption">
                No expiry. Only the unused part of a grant can be revoked.
                Latest 100 grants.
              </p>
              {!user.data.grants.length ? (
                <p>No compensation grants.</p>
              ) : (
                user.data.grants.map((g: Row) => (
                  <div className="admin-grant" key={g.id}>
                    <div>
                      <strong>
                        {g.quantity - g.consumed - g.revoked} {g.kind} credits
                        available
                      </strong>
                      <small>
                        {g.quantity} granted · {g.consumed} used · {g.revoked}{" "}
                        revoked
                      </small>
                      <p>{g.reason}</p>
                    </div>
                    {g.quantity > g.consumed + g.revoked && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          openAction({
                            action: "revoke-credit",
                            target: g.id,
                            label: "Revoke unused credits",
                            maximum: g.quantity - g.consumed - g.revoked,
                          })
                        }
                      >
                        Revoke unused
                      </Button>
                    )}
                  </div>
                ))
              )}
              <h3>Recent interventions</h3>
              {user.data.history.length ? (
                user.data.history.map((h: Row) => (
                  <p key={h.id}>
                    <strong>{h.action}</strong> · {date(h.createdAt)} ·{" "}
                    {h.outcome}
                    <small className="admin-history-reason">{h.reason}</small>
                  </p>
                ))
              ) : (
                <p>No interventions recorded.</p>
              )}
              <Link
                className="admin-text-button"
                to={`/admin/activity?user=${userId}`}
                onClick={() => setUserId(null)}
              >
                View full activity history ↗
              </Link>
            </div>
          )
        )}
      </Modal>
      <ActionDialog
        restoreFocus={(e) => {
          if (actionTrigger.current?.isConnected) {
            e.preventDefault();
            actionTrigger.current.focus();
          }
        }}
        action={action}
        close={() => setAction(null)}
        completed={refresh}
      />
    </div>
  );
}
