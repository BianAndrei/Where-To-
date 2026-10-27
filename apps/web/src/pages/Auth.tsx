import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AppleLogo,
  ArrowLeft,
  ArrowUpRight,
  Envelope,
} from "@phosphor-icons/react";
import { Logo, Doodle } from "../components/Doodle";
import { Button, Field, Notice } from "../components/ui";
import { api, authClient, type Features } from "../lib/api";

// Google's multicolour "G", as its sign-in branding guidelines require.
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
// Better Auth sends people back to /login?error=… when Google or Apple fails.
const socialErrors: Record<string, string> = {
  access_denied: "Sign-in was canceled. You can try again or use your email.",
  account_not_linked:
    "This email already has a Whereto account. Sign in with your password first.",
  signup_disabled: "New accounts can’t be created this way right now.",
};
const socialProviders = [
  { id: "google", name: "Google", icon: <GoogleMark />, flag: "googleAuth" },
  {
    id: "apple",
    name: "Apple",
    icon: <AppleLogo size={19} weight="fill" />,
    flag: "appleAuth",
  },
] as const;
export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signup = location.pathname === "/signup",
    reset = location.pathname === "/reset-password";
  const [name, setName] = useState(""),
    [email, setEmail] = useState(params.get("email") ?? ""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(() => {
      const code = params.get("error");
      return code
        ? (socialErrors[code] ??
            "We couldn’t sign you in with Google or Apple. Please try again.")
        : "";
    }),
    [message, setMessage] = useState(
      params.get("setup") === "owner"
        ? "Your owner account is ready. Open Verify your Whereto email in the local inbox below. You will then choose your password."
        : "",
    ),
    [busy, setBusy] = useState(false),
    [forgot, setForgot] = useState(false),
    [keepSignedIn, setKeepSignedIn] = useState(false);
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api<Features>("/config"),
  });
  const mails = useQuery({
    queryKey: ["dev-mail"],
    queryFn: () => api<any[]>("/dev-mail"),
    enabled: !!config.data?.localMailbox,
    refetchInterval: message ? 2000 : false,
  });
  const next = params.get("next");
  const safeNext =
    next?.startsWith("/") && !next.startsWith("//") ? next : "/app";
  const [socialBusy, setSocialBusy] = useState("");
  // Unconnected providers are hidden in production and shown disabled, with a
  // setup hint, during development.
  const social = socialProviders.filter(
    (p) => config.data?.[p.flag] || config.data?.socialSetupHints,
  );
  const unconnected = social.filter((p) => !config.data?.[p.flag]);
  async function continueWith(provider: "google" | "apple") {
    setSocialBusy(provider);
    setError("");
    const r = await authClient.signIn.social({
      provider,
      callbackURL: safeNext,
      errorCallbackURL: `/login?next=${encodeURIComponent(safeNext)}`,
    });
    // On success the browser is already leaving for Google or Apple.
    if (r.error) {
      setError(r.error.message ?? "Please try again.");
      setSocialBusy("");
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (reset) {
        const r = await authClient.resetPassword({
          newPassword: password,
          token: params.get("token") ?? "",
        });
        if (r.error) throw new Error(r.error.message);
        setMessage("Password changed. You can sign in now.");
      } else if (forgot) {
        const r = await authClient.requestPasswordReset({
          email,
          redirectTo: "/reset-password",
        });
        if (r.error) throw new Error(r.error.message);
        setMessage("If that email has an account, a reset link is on its way.");
      } else if (signup) {
        const r = await authClient.signUp.email({
          email,
          password,
          name,
          callbackURL: "/app",
        });
        if (r.error) throw new Error(r.error.message);
        setMessage("Verify your email, then start planning your first trip.");
      } else {
        // Unticked, the session ends when the browser closes (and within a
        // day); ticked, it lasts 30 days on this device.
        const r = await authClient.signIn.email({
          email,
          password,
          rememberMe: keepSignedIn,
          callbackURL: safeNext,
        });
        if (r.error?.code === "EMAIL_NOT_VERIFIED") {
          setMessage(
            "Please verify your email first. We’ve sent you a new link.",
          );
          return;
        }
        if (r.error) throw new Error(r.error.message);
        if (
          r.data &&
          "twoFactorRedirect" in r.data &&
          r.data.twoFactorRedirect
        ) {
          navigate(`/two-factor?next=${encodeURIComponent(safeNext)}`);
          return;
        }
        navigate(safeNext);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside className="auth-art">
        <Link to="/">
          <Logo />
        </Link>
        <div>
          <Doodle name="suitcase" flow />
          <h1>
            Your next adventure
            <br />
            starts with you.
          </h1>
          <p>
            Lovely plans. Clear budgets.
            <br />
            Your first trip is on us.
          </p>
        </div>
        <span>Made for the way you wander.</span>
      </aside>
      <main className="auth-main">
        <Link to="/" className="text-link back-link">
          <ArrowLeft size={18} /> Back to Whereto
        </Link>
        <div className="auth-form">
          <span className="eyebrow">
            {signup ? "LET’S MAKE SOME MEMORIES" : "YOUR NEXT CHAPTER"}
          </span>
          <h2>
            {reset
              ? "A fresh password."
              : forgot
                ? "Let’s get you back in."
                : signup
                  ? "Hello, fellow wanderer."
                  : "Lovely to see you."}
          </h2>
          <p className="muted">
            {signup
              ? "Create your account. Your first trip is free."
              : "All your plans, right where you left them."}
          </p>
          {error && <Notice error>{error}</Notice>}
          {message ? (
            <>
              <Notice>{message}</Notice>
              {reset && (
                <Link
                  className="button button-primary full-width"
                  to={`/login?next=${encodeURIComponent(safeNext)}&email=${encodeURIComponent(email)}`}
                >
                  Continue to sign in <ArrowUpRight size={18} />
                </Link>
              )}
            </>
          ) : (
            <form onSubmit={submit}>
              {signup && (
                <Field label="Your name">
                  <input
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="What should we call you?"
                  />
                </Field>
              )}
              {!reset && (
                <Field label="Email address">
                  <input
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                  />
                </Field>
              )}
              {!forgot && (
                <Field
                  label="Password"
                  hint={signup || reset ? "At least 10 characters." : ""}
                >
                  <input
                    type="password"
                    minLength={10}
                    autoComplete={
                      signup || reset ? "new-password" : "current-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="Your password"
                  />
                </Field>
              )}
              {!signup && !reset && !forgot && (
                <label className="checkbox-label auth-keep-signed-in">
                  <input
                    type="checkbox"
                    checked={keepSignedIn}
                    onChange={(e) => setKeepSignedIn(e.target.checked)}
                  />
                  Keep me logged in
                </label>
              )}
              <Button type="submit" loading={busy} className="full-width">
                {reset
                  ? "Set new password"
                  : forgot
                    ? "Send reset link"
                    : signup
                      ? "Create my free account"
                      : "Log in"}{" "}
                <ArrowUpRight size={18} />
              </Button>
            </form>
          )}
          {!reset && !forgot && !message && social.length > 0 && (
            <>
              <div className="divider-label">or</div>
              <div className="social-sign-in">
                {social.map((p) => (
                  <Button
                    key={p.id}
                    type="button"
                    variant="secondary"
                    aria-label={`Continue with ${p.name}`}
                    loading={socialBusy === p.id}
                    disabled={!config.data?.[p.flag] || !!socialBusy}
                    onClick={() => void continueWith(p.id)}
                  >
                    {p.icon}
                    <span>
                      <span className="social-sign-in-prefix">
                        Continue with{" "}
                      </span>
                      {p.name}
                    </span>
                  </Button>
                ))}
              </div>
              {unconnected.length > 0 && (
                <p className="fine-print social-sign-in-hint">
                  {unconnected.map((p) => p.name).join(" and ")} sign-in isn’t
                  connected yet. Add the keys from docs/social-login.md to .env
                  and restart the API.
                </p>
              )}
            </>
          )}
          {!signup && !reset && !message && (
            <button className="plain-link" onClick={() => setForgot(!forgot)}>
              {forgot ? "Back to login" : "Forgot your password?"}
            </button>
          )}
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New around here?"}{" "}
            <Link to={signup ? "/login" : "/signup"}>
              {signup ? "Log in" : "Start free"}
            </Link>
          </p>
          <p className="fine-print">
            By continuing, you agree to our <Link to="/terms">terms</Link> and{" "}
            <Link to="/privacy">privacy policy</Link>.
          </p>
          {config.data?.localMailbox && message && (
            <div className="local-mail">
              <strong>
                <Envelope size={18} /> Local development inbox
              </strong>
              <p>
                Email stays on this computer until a mail provider is connected.
              </p>
              {mails.data
                ?.filter((m) => m.to === email)
                .slice(0, 2)
                .map((m) => (
                  <a key={m.id} href={m.url}>
                    {m.subject} <ArrowUpRight size={16} />
                  </a>
                ))}
            </div>
          )}
          {config.data?.emailSetupHint && message && !reset && (
            <div className="local-mail">
              <strong>
                <Envelope size={18} /> Email isn’t connected yet
              </strong>
              <p>
                Nothing was sent. The link is printed in the terminal running{" "}
                <code>npm run dev</code>, after “[dev mail]”. To get real
                emails, follow docs/email.md.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
