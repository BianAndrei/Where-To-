import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserCircle,
  ShieldCheck,
  SlidersHorizontal,
  CreditCard,
  Database,
  Question,
  ArrowLeft,
  ArrowUpRight,
  Check,
  SignOut,
  DownloadSimple,
  Laptop,
} from "@phosphor-icons/react";
import QRCode from "react-qr-code";
import { defaultPreferences, type UserPreferences } from "@whereto/shared";
import { api, authClient, ApiError, post, type Features } from "../lib/api";
import { applyPreferences } from "../lib/preferences";
import { Logo } from "../components/Doodle";
import { Button, Field, Notice, Modal } from "../components/ui";
import { LiquidToggle } from "../components/PlayfulControls";
import { Select, SelectOption } from "../components/Select";
import { MotionPanel } from "../components/motion";
import "./settings.css";

const sections = [
  ["profile", "Your profile", UserCircle],
  ["security", "Security & devices", ShieldCheck],
  ["preferences", "Make it yours", SlidersHorizontal],
  ["billing", "Plan & billing", CreditCard],
  ["data", "Your data", Database],
  ["help", "Help & tutorials", Question],
] as const;
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function checked<T>(
  request: PromiseLike<{ data: T; error: { message?: string } | null }>,
) {
  const result = await request;
  if (result.error)
    throw new Error(result.error.message || "This change could not be saved.");
  return result.data;
}
export default function Settings() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  if (me.error instanceof ApiError && [401, 403].includes(me.error.status))
    return <Navigate to="/login?next=/app/settings" />;
  if (!me.data)
    return (
      <div className="page-loading">
        {me.error ? (
          <Notice error>{me.error.message}</Notice>
        ) : (
          "Opening your settings…"
        )}
      </div>
    );
  return <SettingsWorkspace key={me.data.user.id} account={me.data} />;
}
function SettingsWorkspace({ account }: { account: any }) {
  const query = useQueryClient(),
    navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = sections.some(([id]) => id === params.get("section"))
    ? params.get("section")!
    : "profile";
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    if (matchMedia("(max-width: 640px)").matches)
      navigation.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.scrollIntoView({
          block: "nearest",
          inline: "center",
          behavior: "instant",
        });
  }, [section]);
  const [name, setName] = useState(account.user.name || "");
  const [email, setEmail] = useState("");
  const [preferences, setPreferences] = useState<UserPreferences>({
    ...defaultPreferences,
    ...account.preferences,
  });
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [factorPassword, setFactorPassword] = useState("");
  const [setup, setSetup] = useState<{
    totpURI: string;
    backupCodes: string[];
  } | null>(null);
  const [backupSaved, setBackupSaved] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [clearOpen, setClearOpen] = useState(false);
  const features = useQuery({
    queryKey: ["features"],
    queryFn: () => api<Features>("/config"),
  });
  const sessions = useQuery({
    queryKey: ["account-sessions"],
    queryFn: () => checked(authClient.listSessions()),
    enabled: section === "security",
  });
  const currentSession = useQuery({
    queryKey: ["current-session"],
    queryFn: () => checked(authClient.getSession()),
    enabled: section === "security",
  });
  const accounts = useQuery({
    queryKey: ["linked-accounts"],
    queryFn: () => checked(authClient.listAccounts()),
    enabled: section === "security",
  });
  const hasPassword = accounts.data?.some(
    (item) => item.providerId === "credential",
  );
  async function run(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await action();
      if (section === "security")
        await Promise.all([
          query.invalidateQueries({ queryKey: ["account-sessions"] }),
          query.invalidateQueries({ queryKey: ["current-session"] }),
          query.invalidateQueries({ queryKey: ["me"] }),
        ]);
      setSuccess(message);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const savePreferences = async () => {
    const saved = await api<UserPreferences>("/me/preferences", {
      method: "PATCH",
      body: JSON.stringify(preferences),
    });
    applyPreferences(saved);
    query.setQueryData(["me"], (previous: any) => ({
      ...previous,
      preferences: saved,
    }));
  };
  const logout = () =>
    run(async () => {
      await checked(authClient.signOut());
      try {
        localStorage.removeItem("whereto-offline");
        localStorage.removeItem("whereto-nav-compact");
      } catch {}
      applyPreferences(defaultPreferences);
      query.clear();
      navigate("/login");
    }, "Signed out.");
  return (
    <div className="account-settings">
      <header className="app-header">
        <Link to="/" aria-label="Whereto home">
          <Logo />
        </Link>
        <Link to="/app" className="text-link">
          <ArrowLeft size={17} /> Your trips
        </Link>
      </header>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-person">
            <span>{account.user.name?.[0]?.toUpperCase() || "W"}</span>
            <strong>{account.user.name}</strong>
            <small>{account.user.email}</small>
          </div>
          <nav ref={navigation} aria-label="Account settings">
            {sections.map(([id, label, Icon]) => (
              <button
                key={id}
                aria-current={section === id ? "page" : undefined}
                onClick={() => {
                  setParams({ section: id });
                  setError("");
                  setSuccess("");
                }}
              >
                <Icon size={21} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <button className="settings-signout" disabled={busy} onClick={logout}>
            <SignOut size={19} /> Log out
          </button>
        </aside>
        <main className="settings-main">
          <span className="eyebrow">YOUR SPACE, YOUR WAY</span>
          <h1>Feel at home.</h1>
          <p className="settings-intro">
            Your account, preferences and peace of mind.
          </p>
          {error && <Notice error>{error}</Notice>}
          {success && (
            <div role="status" className="settings-success">
              <Check size={18} />
              {success}
            </div>
          )}
          <MotionPanel changeKey={section} distance={12}>
            {section === "profile" && (
              <>
                <section className="settings-section">
                  <h2>Your profile</h2>
                  <p>A familiar name for your travel companions.</p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await checked(
                          authClient.updateUser({ name: name.trim() }),
                        );
                        await query.invalidateQueries({ queryKey: ["me"] });
                      }, "Your profile is saved.");
                    }}
                  >
                    <Field label="Display name">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={100}
                        autoComplete="name"
                      />
                    </Field>
                    <Button loading={busy} disabled={!name.trim()}>
                      Save profile
                    </Button>
                  </form>
                </section>
                <section className="settings-section">
                  <h2>Email address</h2>
                  <p>
                    {account.user.email}{" "}
                    <span className="settings-verified">
                      {account.user.emailVerified
                        ? "Verified"
                        : "Awaiting verification"}
                    </span>
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        await checked(
                          authClient.changeEmail({
                            newEmail: email.trim(),
                            callbackURL: "/app/settings",
                          }),
                        );
                        setEmail("");
                      }, "Check your current inbox to approve the change, then verify your new email address.");
                    }}
                  >
                    <Field label="New email address">
                      <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        maxLength={254}
                      />
                    </Field>
                    <Button variant="secondary" loading={busy}>
                      Request email change
                    </Button>
                  </form>
                  {!account.user.emailVerified && (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            checked(
                              authClient.sendVerificationEmail({
                                email: account.user.email,
                                callbackURL: "/app/settings",
                              }),
                            ),
                          "Verification email sent. Check your inbox.",
                        )
                      }
                    >
                      Resend verification email
                    </Button>
                  )}
                </section>
              </>
            )}
            {section === "security" && (
              <>
                <section className="settings-section">
                  <h2>Password & sign-in</h2>
                  {accounts.isPending ? (
                    <p>Checking your sign-in methods…</p>
                  ) : accounts.error ? (
                    <Notice error>{accounts.error.message}</Notice>
                  ) : hasPassword ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          if (newPassword !== confirmPassword)
                            throw new Error("Your new passwords do not match.");
                          await checked(
                            authClient.changePassword({
                              currentPassword: password,
                              newPassword,
                              revokeOtherSessions: true,
                            }),
                          );
                          setPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                          await query.invalidateQueries({
                            queryKey: ["account-sessions"],
                          });
                        }, "Password updated. Your other sessions have been signed out.");
                      }}
                    >
                      <Field label="Current password">
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </Field>
                      <div className="form-grid">
                        <Field
                          label="New password"
                          hint="At least 10 characters."
                        >
                          <input
                            type="password"
                            autoComplete="new-password"
                            minLength={10}
                            maxLength={128}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                          />
                        </Field>
                        <Field label="Confirm new password">
                          <input
                            type="password"
                            autoComplete="new-password"
                            minLength={10}
                            maxLength={128}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                          />
                        </Field>
                      </div>
                      <Button loading={busy}>Update password</Button>
                    </form>
                  ) : (
                    <>
                      <p>
                        You sign in with{" "}
                        {accounts.data
                          ?.map((item) => item.providerId)
                          .join(", ") || "a connected provider"}
                        . You can add a password using a secure reset email.
                      </p>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              checked(
                                authClient.requestPasswordReset({
                                  email: account.user.email,
                                  redirectTo: "/reset-password",
                                }),
                              ),
                            "A password setup link has been requested. Check your inbox.",
                          )
                        }
                      >
                        Send password setup email
                      </Button>
                    </>
                  )}
                </section>
                <section className="settings-section">
                  <h2>Authenticator protection</h2>
                  <p>
                    {account.user.twoFactorEnabled
                      ? "Your account has two-factor authentication enabled."
                      : "Add a code from your authenticator app when you sign in."}
                  </p>
                  {setup ? (
                    <div className="settings-factor-setup">
                      <QRCode value={setup.totpURI} size={168} />
                      <p>
                        Scan with your authenticator app. Keep these recovery
                        codes somewhere private; each can be used once.
                      </p>
                      <div className="settings-backup-codes">
                        {setup.backupCodes.map((value) => (
                          <code key={value}>{value}</code>
                        ))}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          download(
                            "whereto-recovery-codes.json",
                            setup.backupCodes,
                          )
                        }
                      >
                        <DownloadSimple size={17} />
                        Download recovery codes
                      </Button>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={backupSaved}
                          onChange={(e) => setBackupSaved(e.target.checked)}
                        />
                        I saved my recovery codes
                      </label>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run(async () => {
                            await checked(
                              authClient.twoFactor.verifyTotp({ code }),
                            );
                            setSetup(null);
                            setCode("");
                            await query.invalidateQueries({ queryKey: ["me"] });
                          }, "Authenticator enabled.");
                        }}
                      >
                        <Field label="Six-digit authenticator code">
                          <input
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            pattern="[0-9]{6}"
                            value={code}
                            onChange={(e) =>
                              setCode(
                                e.target.value.replace(/\D/g, "").slice(0, 6),
                              )
                            }
                            required
                          />
                        </Field>
                        <Button loading={busy} disabled={!backupSaved}>
                          Verify and enable
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setSetup(null);
                            setCode("");
                          }}
                        >
                          Cancel setup
                        </Button>
                      </form>
                    </div>
                  ) : (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(
                          async () => {
                            if (account.user.twoFactorEnabled) {
                              await checked(
                                authClient.twoFactor.disable({
                                  ...(hasPassword
                                    ? { password: factorPassword }
                                    : {}),
                                }),
                              );
                              await query.invalidateQueries({
                                queryKey: ["me"],
                              });
                            } else {
                              const result = await checked(
                                authClient.twoFactor.enable({
                                  ...(hasPassword
                                    ? { password: factorPassword }
                                    : {}),
                                  issuer: "Whereto",
                                }),
                              );
                              if (result && "totpURI" in result) {
                                setSetup(result);
                                setBackupSaved(false);
                              } else {
                                throw new Error(
                                  "Authenticator setup is unavailable. Please try again.",
                                );
                              }
                            }
                            setFactorPassword("");
                          },
                          account.user.twoFactorEnabled
                            ? "Authenticator disabled."
                            : "Scan the QR code and verify to finish setup.",
                        );
                      }}
                    >
                      {hasPassword && (
                        <Field label="Confirm your password">
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={factorPassword}
                            onChange={(e) => setFactorPassword(e.target.value)}
                            required
                          />
                        </Field>
                      )}
                      <Button
                        variant="secondary"
                        loading={busy}
                        disabled={accounts.isPending || !!accounts.error}
                      >
                        {account.user.twoFactorEnabled
                          ? "Disable authenticator"
                          : "Set up authenticator"}
                      </Button>
                    </form>
                  )}
                </section>
                <section className="settings-section">
                  <h2>Active devices</h2>
                  <p>Sign out sessions you no longer use.</p>
                  {sessions.isPending ? (
                    <p>Loading sessions…</p>
                  ) : sessions.error ? (
                    <Notice error>{sessions.error.message}</Notice>
                  ) : (
                    sessions.data?.map((session) => (
                      <div className="settings-session" key={session.id}>
                        <Laptop size={23} />
                        <div>
                          <strong>
                            {session.userAgent?.includes("Mobile")
                              ? "Mobile browser"
                              : "Browser session"}
                            {session.id === currentSession.data?.session.id && (
                              <small> · This device</small>
                            )}
                          </strong>
                          <p>
                            {session.userAgent?.includes("Firefox")
                              ? "Firefox"
                              : session.userAgent?.includes("Edg")
                                ? "Edge"
                                : session.userAgent?.includes("Chrome")
                                  ? "Chrome"
                                  : session.userAgent?.includes("Safari")
                                    ? "Safari"
                                    : "Browser"}{" "}
                            · Signed in{" "}
                            {new Date(session.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        {session.id !== currentSession.data?.session.id && (
                          <Button
                            variant="ghost"
                            disabled={busy || !currentSession.data}
                            onClick={() =>
                              run(async () => {
                                await checked(
                                  authClient.revokeSession({
                                    token: session.token,
                                  }),
                                );
                                await query.invalidateQueries({
                                  queryKey: ["account-sessions"],
                                });
                              }, "Session signed out.")
                            }
                          >
                            Sign out
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                  <Button
                    variant="secondary"
                    disabled={busy || sessions.isPending}
                    onClick={() =>
                      run(async () => {
                        await checked(authClient.revokeOtherSessions());
                        await query.invalidateQueries({
                          queryKey: ["account-sessions"],
                        });
                      }, "Other devices have been signed out.")
                    }
                  >
                    Sign out other devices
                  </Button>
                </section>
              </>
            )}
            {section === "preferences" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    savePreferences,
                    "Your preferences are saved to your account.",
                  );
                }}
              >
                <section className="settings-section">
                  <h2>A head start for new trips</h2>
                  <p>
                    Defaults for your next adventure. Existing trips keep their
                    own settings.
                  </p>
                  <div className="form-grid">
                    <Field label="Default currency">
                      <Select
                        value={preferences.currency}
                        onValueChange={(currency) =>
                          setPreferences({
                            ...preferences,
                            currency: currency as UserPreferences["currency"],
                          })
                        }
                      >
                        {[
                          "EUR",
                          "GBP",
                          "USD",
                          "RON",
                          "CHF",
                          "JPY",
                          "AUD",
                          "CAD",
                          "SGD",
                          "THB",
                        ].map((value) => (
                          <SelectOption key={value}>{value}</SelectOption>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Start trips in">
                      <Select
                        value={preferences.defaultView}
                        onValueChange={(defaultView) =>
                          setPreferences({
                            ...preferences,
                            defaultView:
                              defaultView as UserPreferences["defaultView"],
                          })
                        }
                      >
                        <SelectOption value="itinerary">Itinerary</SelectOption>
                        <SelectOption value="budget">Budget</SelectOption>
                      </Select>
                    </Field>
                  </div>
                  <Field label="Usual departure city">
                    <input
                      maxLength={120}
                      value={preferences.departureCity}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          departureCity: e.target.value,
                        })
                      }
                      placeholder="Your home city"
                    />
                  </Field>
                </section>
                <section className="settings-section">
                  <h2>Comfort & navigation</h2>
                  <div className="settings-option">
                    <div>
                      <strong>Compact navigation</strong>
                      <p>More room for your plan, with an icon rail.</p>
                    </div>
                    <LiquidToggle
                      checked={preferences.compactNav}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          compactNav: e.target.checked,
                        })
                      }
                    >
                      Use compact navigation
                    </LiquidToggle>
                  </div>
                  <div className="settings-option">
                    <div>
                      <strong>Reduce motion</strong>
                      <p>
                        Keep transitions still and skip decorative intros. Your
                        system setting is also respected.
                      </p>
                    </div>
                    <LiquidToggle
                      checked={preferences.reducedMotion}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          reducedMotion: e.target.checked,
                        })
                      }
                    >
                      Reduce motion
                    </LiquidToggle>
                  </div>
                  <div className="settings-option">
                    <div>
                      <strong>Welcome guidance</strong>
                      <p>
                        Show an invitation to explore guides when entering a new
                        workspace.
                      </p>
                    </div>
                    <LiquidToggle
                      checked={preferences.showGuides}
                      onChange={(e) =>
                        setPreferences({
                          ...preferences,
                          showGuides: e.target.checked,
                        })
                      }
                    >
                      Show welcome guides
                    </LiquidToggle>
                  </div>
                </section>
                <Button loading={busy}>Save preferences</Button>
              </form>
            )}
            {section === "billing" && (
              <section className="settings-section">
                <span className="settings-plan-icon">
                  <CreditCard size={30} />
                </span>
                <h2>{account.pro ? "Whereto Plus" : "Your Whereto plan"}</h2>
                <p>
                  {account.pro
                    ? "Your subscription gives you room for more journeys."
                    : account.entitlement?.freeTripClaimedAt
                      ? "Your free trip is claimed. Your existing plans remain available."
                      : "Your first trip is free. No card required."}
                </p>
                <dl className="settings-billing">
                  <div>
                    <dt>Subscription</dt>
                    <dd>
                      {account.entitlement?.subscriptionStatus ||
                        "No active subscription"}
                    </dd>
                  </div>
                  {account.entitlement?.paidUntil && (
                    <div>
                      <dt>
                        {account.entitlement.cancelAtPeriodEnd
                          ? "Access until"
                          : "Current period ends"}
                      </dt>
                      <dd>
                        {new Date(
                          account.entitlement.paidUntil,
                        ).toLocaleDateString()}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Bonus trip credits</dt>
                    <dd>{account.tripCredits || 0}</dd>
                  </div>
                </dl>
                {account.entitlement?.stripeCustomerId ? (
                  <Button
                    disabled={busy || !features.data?.payments}
                    onClick={() =>
                      run(async () => {
                        const result = await post("/billing/portal", {});
                        window.location.assign(result.url);
                      }, "Opening billing…")
                    }
                  >
                    Manage payments & invoices
                    <ArrowUpRight size={17} />
                  </Button>
                ) : (
                  <Link to="/pricing" className="button button-primary">
                    Explore plans
                    <ArrowUpRight size={17} />
                  </Link>
                )}
                {features.data && !features.data.payments && (
                  <p className="fine-print">
                    Online billing is not connected on this installation yet.
                  </p>
                )}
                <p className="fine-print">
                  Payment methods, invoices and subscription cancellation are
                  managed securely in the billing portal.
                </p>
              </section>
            )}
            {section === "data" && (
              <>
                <section className="settings-section">
                  <h2>Your plans, in your hands</h2>
                  <p>
                    Download a JSON copy of your profile, preferences and the
                    trips you can access. Attached files are downloaded
                    separately from each trip’s Documents.
                  </p>
                  <Button
                    variant="secondary"
                    loading={busy}
                    onClick={() =>
                      run(async () => {
                        const trips = await api("/trips");
                        download("whereto-my-data.json", {
                          exportedAt: new Date().toISOString(),
                          profile: {
                            name: account.user.name,
                            email: account.user.email,
                            createdAt: account.user.createdAt,
                          },
                          preferences: account.preferences,
                          trips,
                        });
                      }, "Your data download is ready.")
                    }
                  >
                    <DownloadSimple size={17} />
                    Export my data
                  </Button>
                </section>
                <section className="settings-section">
                  <h2>On this device</h2>
                  <p>
                    Remove your saved setup draft and offline trip copy from
                    this browser. Trips saved to your account are kept.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setClearOpen(true)}
                  >
                    Clear local trip data
                  </Button>
                </section>
                <section className="settings-section">
                  <h2>Privacy & sharing</h2>
                  <p>
                    Manage public links and collaborators from Share inside each
                    trip. Revoking a public link stops access through that link.
                  </p>
                  <div className="settings-links">
                    <Link to="/privacy">
                      Privacy details
                      <ArrowUpRight size={16} />
                    </Link>
                    <Link to="/terms">
                      Terms
                      <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </section>
              </>
            )}
            {section === "help" && (
              <section className="settings-section">
                <span className="settings-plan-icon">
                  <Question size={30} />
                </span>
                <h2>A hand, whenever you need it.</h2>
                <p>
                  Replay a walkthrough or explore every feature from Help &
                  guides inside your trip.
                </p>
                <Link to="/app?guide=true" className="settings-guide-link">
                  <strong>Dashboard walkthrough</strong>
                  <span>Your trips, search, archives and your account.</span>
                  <ArrowRightIcon />
                </Link>
                <Link to="/demo?guide=true" className="settings-guide-link">
                  <strong>Try the planner guide</strong>
                  <span>
                    Days, budgets, people, receipts, bookings, sharing and more.
                  </span>
                  <ArrowRightIcon />
                </Link>
                <Link to="/app/new" className="settings-guide-link">
                  <strong>Set up a new trip</strong>
                  <span>Four clear steps, with help along the way.</span>
                  <ArrowRightIcon />
                </Link>
                <p className="fine-print">
                  The example planner keeps changes on this device.
                </p>
              </section>
            )}
          </MotionPanel>
        </main>
      </div>
      <Modal
        open={clearOpen}
        onOpenChange={setClearOpen}
        title="Clear this device’s trip data?"
        description="This removes your setup draft and offline copy. Your trips saved to your account stay safe."
      >
        <div className="settings-confirm-actions">
          <Button variant="ghost" onClick={() => setClearOpen(false)}>
            Keep local data
          </Button>
          <Button
            onClick={() => {
              try {
                localStorage.removeItem(`whereto-draft:${account.user.id}`);
                localStorage.removeItem("whereto-offline");
                setSuccess("Local trip data cleared.");
                setClearOpen(false);
              } catch {
                setError(
                  "This browser did not allow clearing its local storage.",
                );
              }
            }}
          >
            Clear local data
          </Button>
        </div>
      </Modal>
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={20} aria-hidden="true" />;
}
