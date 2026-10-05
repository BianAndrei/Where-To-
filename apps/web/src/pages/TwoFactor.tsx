import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { authClient } from "../lib/api";
import { Logo } from "../components/Doodle";
import { Button, Field, Notice } from "../components/ui";

export default function TwoFactor() {
  const [params] = useSearchParams(),
    navigate = useNavigate();
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [recovery, setRecovery] = useState(false);
  return (
    <main
      className="auth-form"
      style={{ maxWidth: 450, margin: "10vh auto", padding: 24 }}
    >
      <Link to="/">
        <Logo />
      </Link>
      <h1 style={{ fontSize: 32, marginTop: 32 }}>Verify your sign-in.</h1>
      <p>
        {recovery
          ? "Enter one unused backup code to recover your login. Admin still requires an authenticator code."
          : "Enter the current six-digit code from your authenticator."}
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = recovery
              ? await authClient.twoFactor.verifyBackupCode({ code })
              : await authClient.twoFactor.verifyTotp({ code });
            if (result.error) throw new Error(result.error.message);
            const next = params.get("next");
            navigate(
              next?.startsWith("/") && !next.startsWith("//") ? next : "/app",
              { replace: true },
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Verification failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={recovery ? "Backup code" : "Authenticator code"}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode={recovery ? "text" : "numeric"}
            autoComplete="one-time-code"
            required
            maxLength={recovery ? 100 : 6}
            autoFocus
          />
        </Field>
        {error && <Notice error>{error}</Notice>}
        <Button type="submit" loading={busy}>
          Verify and continue
        </Button>
      </form>
      <Button
        variant="ghost"
        onClick={() => {
          setRecovery(!recovery);
          setCode("");
        }}
      >
        {recovery ? "Use my authenticator" : "Use a backup code"}
      </Button>
    </main>
  );
}
