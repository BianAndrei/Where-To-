import { useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  Envelope,
  GoogleLogo,
} from "@phosphor-icons/react";
import { Logo, Doodle } from "../components/Doodle";
import { Button, Field, Notice } from "../components/ui";
import { api, authClient, type Features } from "../lib/api";
export default function Auth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signup = location.pathname === "/signup",
    reset = location.pathname === "/reset-password";
  const [name, setName] = useState(""),
    [email, setEmail] = useState(params.get("email") ?? ""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(
      params.get("setup") === "owner"
        ? "Your owner account is ready. Open Verify your Whereto email in the local inbox below. You will then choose your password."
        : "",
    ),
    [busy, setBusy] = useState(false),
    [forgot, setForgot] = useState(false);
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
        setMessage(
          "Verify your email, then start planning your first trip.",
        );
      } else {
        const r = await authClient.signIn.email({ email, password });
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
          {!signup && !reset && !message && (
            <button className="plain-link" onClick={() => setForgot(!forgot)}>
              {forgot ? "Back to login" : "Forgot your password?"}
            </button>
          )}
          {!reset && !forgot && config.data?.googleAuth && (
            <>
              <div className="divider-label">or</div>
              <Button
                variant="secondary"
                className="full-width"
                onClick={() =>
                  void authClient.signIn.social({
                    provider: "google",
                    callbackURL: safeNext,
                  })
                }
              >
                <GoogleLogo size={19} /> Continue with Google
              </Button>
            </>
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
        </div>
      </main>
    </div>
  );
}
