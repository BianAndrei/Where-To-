import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";

let server: Server, base: string, db: typeof import("../apps/api/src/db").db;
const origin = "http://localhost:5173";
const password = "Security-fixture-" + randomUUID();
const ids: string[] = [];
const emails: string[] = [];
const initialNoListen = process.env.WHERETO_NO_LISTEN;
// Every request gets its own client address unless a test says otherwise, so
// the per-IP limiter only fires where a test is about it.
let address = 0;
const nextAddress = () => `203.0.113.${(address = (address % 250) + 1)}`;

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function auth(
  path: string,
  body: unknown,
  options: { cookie?: string; forwardedFor?: string; requestId?: string } = {},
) {
  return fetch(`${base}/api/auth${path}`, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      "X-Forwarded-For": options.forwardedFor ?? nextAddress(),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.requestId ? { "X-Request-ID": options.requestId } : {}),
    },
    body: JSON.stringify(body),
  });
}
async function createUser() {
  const id = randomUUID();
  const email = `security-${id}@example.test`;
  ids.push(id);
  emails.push(email);
  await db.user.create({
    data: {
      id,
      name: "Security fixture",
      email,
      emailVerified: true,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  return { id, email };
}
const events = (email: string) =>
  db.loginEvent.findMany({ where: { email }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await import("../apps/api/src/config");
  process.env.WHERETO_NO_LISTEN = "true";
  ({ db } = await import("../apps/api/src/db"));
  const { app } = await import("../apps/api/src/server");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  await db?.loginEvent.deleteMany({
    where: {
      OR: [
        { userId: { in: ids } },
        { email: { in: emails } },
        { email: { startsWith: "security-probe-" } },
      ],
    },
  });
  await db?.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await db?.devMail.deleteMany({ where: { to: { in: emails } } });
  await db?.user.deleteMany({ where: { id: { in: ids } } });
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (initialNoListen === undefined) delete process.env.WHERETO_NO_LISTEN;
  else process.env.WHERETO_NO_LISTEN = initialNoListen;
  await db?.$disconnect();
});

describe.sequential("Sign-in and recovery hardening", () => {
  it("rate-limits by the proxy-appended address, so a forged X-Forwarded-For prefix buys nothing", async () => {
    const real = "198.51.100.77";
    const probe = `security-probe-${randomUUID()}@example.test`;
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++)
      statuses.push(
        (
          await auth(
            "/sign-in/email",
            { email: probe, password: "not-the-password" },
            // The client controls everything left of the last comma.
            { forwardedFor: `10.${i}.0.1, ${real}` },
          )
        ).status,
      );
    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses[3]).toBe(429);
    // And the reverse: distinct real clients behind one forged prefix are
    // separate people, not one shared bucket that a single attacker can fill.
    for (let i = 0; i < 4; i++)
      expect(
        (
          await auth(
            "/sign-in/email",
            { email: probe, password: "not-the-password" },
            { forwardedFor: `6.6.6.6, 198.51.100.${80 + i}` },
          )
        ).status,
      ).toBe(401);
    const recorded = await events(probe);
    // Only real client addresses reach the security log, never forged ones.
    expect(recorded.length).toBeGreaterThan(0);
    expect(recorded.map((e) => e.ipAddress)).toContain(real);
    expect(
      recorded.filter(
        (e) => e.ipAddress?.startsWith("10.") || e.ipAddress === "6.6.6.6",
      ),
    ).toEqual([]);
  });

  it("locks an address after 10 wrong passwords, the same way whether or not an account exists", async () => {
    const user = await createUser();
    const unknown = `security-probe-${randomUUID()}@example.test`;
    const locked: { status: number; body: any }[] = [];
    for (const email of [user.email, unknown]) {
      for (let i = 0; i < 10; i++)
        expect(
          (await auth("/sign-in/email", { email, password: "wrong-" + i }))
            .status,
        ).toBe(401);
      // Even the right password is refused while the lock lasts.
      const response = await auth("/sign-in/email", { email, password });
      locked.push({ status: response.status, body: await response.json() });
    }
    expect(locked[0]).toEqual(locked[1]);
    expect(locked[0]).toMatchObject({
      status: 429,
      body: { code: "ACCOUNT_LOCKED" },
    });
    const recorded = await events(user.email);
    expect(recorded.filter((e) => e.event === "login_failed")).toHaveLength(10);
    expect(recorded.at(-1)).toMatchObject({
      event: "login_locked",
      userId: user.id,
    });
    expect(JSON.stringify(recorded)).not.toContain(password);
    // A completed password reset proves inbox ownership and lifts the lock.
    await db.loginEvent.create({
      data: {
        email: user.email,
        userId: user.id,
        event: "password_reset_completed",
      },
    });
    expect(
      (await auth("/sign-in/email", { email: user.email, password })).status,
    ).toBe(200);
    // Otherwise the lock lifts once its 15-minute window has passed.
    expect(
      (await auth("/sign-in/email", { email: unknown, password })).status,
    ).toBe(429);
    await db.loginEvent.updateMany({
      where: { email: unknown },
      data: { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect(
      (await auth("/sign-in/email", { email: unknown, password })).status,
    ).toBe(401);
  });

  it("records a correct password awaiting an authenticator as two_factor_required, not as a sign-in", async () => {
    const user = await createUser();
    const login = await auth("/sign-in/email", { email: user.email, password });
    expect(login.status).toBe(200);
    const enable = await auth(
      "/two-factor/enable",
      { password },
      { cookie: cookies(login) },
    );
    expect(enable.status).toBe(200);
    const secret = new TextDecoder().decode(
      base32.decode(
        new URL((await enable.json()).totpURI).searchParams.get("secret")!,
      ),
    );
    const enrolled = await auth(
      "/two-factor/verify-totp",
      { code: await createOTP(secret).totp() },
      { cookie: cookies(login) },
    );
    expect(enrolled.status).toBe(200);
    // A signed-in session may not keep guessing codes once 2FA is active.
    for (const path of [
      "/two-factor/verify-totp",
      "/two-factor/verify-backup-code",
    ])
      expect(
        (await auth(path, { code: "123456" }, { cookie: cookies(enrolled) }))
          .status,
      ).toBe(403);

    const requestId = randomUUID();
    const challenge = await auth(
      "/sign-in/email",
      { email: user.email, password },
      { requestId },
    );
    expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
    expect(
      await db.loginEvent.findMany({ where: { requestId } }),
    ).toMatchObject([{ event: "two_factor_required", userId: user.id }]);
    const pending = cookies(challenge);
    const wrong =
      (await createOTP(secret).totp()) === "000000" ? "000001" : "000000";
    expect(
      (
        await auth(
          "/two-factor/verify-totp",
          { code: wrong },
          { cookie: pending },
        )
      ).status,
    ).toBe(401);
    const passed = await auth(
      "/two-factor/verify-totp",
      { code: await createOTP(secret).totp() },
      { cookie: pending },
    );
    expect(passed.status).toBe(200);
    const recorded = (
      await db.loginEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((e) => e.event);
    expect(recorded).toEqual([
      "login_success",
      "two_factor_enabled",
      "two_factor_required",
      "two_factor_failed",
      "login_success",
    ]);
  });

  it("answers reset requests identically, caps them per address, and a reset ends every session and admin proof", async () => {
    const user = await createUser();
    const unknown = `security-probe-${randomUUID()}@example.test`;
    const answers = [];
    for (const email of [unknown, user.email]) {
      const response = await auth("/request-password-reset", {
        email,
        redirectTo: "/reset-password",
      });
      answers.push({ status: response.status, body: await response.json() });
    }
    expect(answers[0]).toEqual(answers[1]);
    expect((await events(unknown)).map((e) => [e.event, e.userId])).toEqual([
      ["password_reset_requested", null],
    ]);

    // Five reset emails an hour per address; later requests get the same answer
    // but no email, so nobody can flood an inbox.
    for (let i = 0; i < 6; i++)
      expect(
        (
          await auth("/request-password-reset", {
            email: user.email,
            redirectTo: "/reset-password",
          })
        ).status,
      ).toBe(200);
    const mails = await db.devMail.findMany({
      where: { to: user.email, subject: "Reset your Whereto password" },
      orderBy: { createdAt: "desc" },
    });
    expect(mails).toHaveLength(5);

    const login = await auth("/sign-in/email", { email: user.email, password });
    const session = await db.session.findFirstOrThrow({
      where: { userId: user.id },
    });
    await db.adminProof.create({
      data: { sessionId: session.id, verifiedAt: new Date() },
    });
    const token = new URL(mails[0]!.url).pathname.split("/").pop()!;
    const fresh = "Security-reset-" + randomUUID();
    expect(
      (await auth("/reset-password", { newPassword: fresh, token })).status,
    ).toBe(200);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await db.adminProof.count({ where: { sessionId: session.id } }),
    ).toBe(0);
    // The old session cookie no longer works, and the token is single use.
    expect(
      (
        await fetch(`${base}/api/v1/me`, {
          headers: { Origin: origin, Cookie: cookies(login) },
        })
      ).status,
    ).toBe(401);
    expect(
      (await auth("/reset-password", { newPassword: fresh + "x", token }))
        .status,
    ).toBe(400);
    expect(
      await db.devMail.count({
        where: { to: user.email, subject: "Your Whereto password was changed" },
      }),
    ).toBe(1);
    expect((await events(user.email)).map((e) => e.event)).toContain(
      "password_reset_completed",
    );
    expect(
      (await auth("/sign-in/email", { email: user.email, password: fresh }))
        .status,
    ).toBe(200);
  });

  it("keeps a session for 30 days only when 'Keep me logged in' is ticked", async () => {
    const user = await createUser();
    const sessionCookie = (response: Response) =>
      response.headers
        .getSetCookie()
        .find((c) => c.includes("session_token=") && !/max-age=0\b/i.test(c))!;
    const day = 24 * 60 * 60 * 1000;
    const until = async (response: Response) => {
      const token = decodeURIComponent(
        sessionCookie(response).split(";")[0]!.split("=")[1]!,
      ).split(".")[0]!;
      const row = await db.session.findUniqueOrThrow({ where: { token } });
      return row.expiresAt.getTime() - Date.now();
    };

    const brief = await auth("/sign-in/email", {
      email: user.email,
      password,
      rememberMe: false,
    });
    expect(brief.status).toBe(200);
    // A browser-session cookie: no Max-Age or Expires, gone when the browser closes.
    expect(sessionCookie(brief)).not.toMatch(/max-age|expires/i);
    expect(await until(brief)).toBeLessThanOrEqual(day);

    const kept = await auth("/sign-in/email", {
      email: user.email,
      password,
      rememberMe: true,
    });
    expect(sessionCookie(kept)).toMatch(/max-age=2592000/i);
    expect(await until(kept)).toBeGreaterThan(29 * day);
  });

  it("sends a fresh verification link only when an unverified account signs in with the right password", async () => {
    const { id, email } = await createUser();
    await db.user.update({ where: { id }, data: { emailVerified: false } });
    const wrong = await auth("/sign-in/email", {
      email,
      password: "not-the-password",
    });
    expect(wrong.status).toBe(401);
    expect(await db.devMail.count({ where: { to: email } })).toBe(0);

    const right = await auth("/sign-in/email", {
      email,
      password,
      callbackURL: "/app",
    });
    expect(right.status).toBe(403);
    expect((await right.json()).code).toBe("EMAIL_NOT_VERIFIED");
    expect(cookies(right)).not.toContain("session_token");
    const mail = await db.devMail.findFirstOrThrow({ where: { to: email } });
    expect(mail.subject).toBe("Verify your Whereto email");

    const verified = await fetch(mail.url.replace(origin, base), {
      redirect: "manual",
      headers: { Origin: origin },
    });
    expect(verified.status).toBe(302);
    expect(verified.headers.get("location")).toBe("/app");
    expect(cookies(verified)).toContain("session_token");
    expect(
      (await db.user.findUniqueOrThrow({ where: { id } })).emailVerified,
    ).toBe(true);
  });

  it("serves the development inbox only when LOCAL_MAILBOX is switched on", async () => {
    const previous = process.env.LOCAL_MAILBOX;
    try {
      process.env.LOCAL_MAILBOX = "false";
      expect(
        (
          await fetch(`${base}/api/v1/dev-mail`, {
            headers: { Origin: origin },
          })
        ).status,
      ).toBe(404);
    } finally {
      process.env.LOCAL_MAILBOX = previous;
    }
  });
});
