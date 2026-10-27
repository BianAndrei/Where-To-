import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import type { Server } from "node:http";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";

let server: Server, base: string, db: typeof import("../apps/api/src/db").db;
const origin = "http://localhost:5173";
const ids: string[] = [];
const emails: string[] = [];
const realFetch = globalThis.fetch;
let googleProfile: Record<string, unknown> = {};
let address = 0;

// Only Google's token endpoint is faked; every other request is real.
const unsignedJwt = (claims: Record<string, unknown>) =>
  [{ alg: "none", typ: "JWT" }, claims, ""]
    .map((part, i) =>
      i < 2 ? Buffer.from(JSON.stringify(part)).toString("base64url") : "",
    )
    .join(".");
const fetchSpy = vi
  .spyOn(globalThis, "fetch")
  .mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.startsWith("https://oauth2.googleapis.com/token"))
      return new Response(
        JSON.stringify({
          access_token: "fixture-google-access-token",
          id_token: unsignedJwt({
            iss: "https://accounts.google.com",
            aud: process.env.GOOGLE_CLIENT_ID,
            ...googleProfile,
          }),
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid email profile",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    return realFetch(input, init);
  });

class Jar {
  cookies = new Map<string, string>();
  take(response: Response) {
    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(";");
      const [name, value] = [
        pair!.slice(0, pair!.indexOf("=")),
        pair!.slice(pair!.indexOf("=") + 1),
      ];
      if (!value || attributes.some((a) => /max-age=0\b/i.test(a.trim())))
        this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
  toString() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}
async function call(jar: Jar, path: string, body?: unknown): Promise<Response> {
  return jar.take(
    await realFetch(`${base}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "X-Forwarded-For": `203.0.113.${++address}`,
        Cookie: jar.toString(),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
}
async function continueWithGoogle(jar: Jar, email: string) {
  googleProfile = {
    sub: "google-" + randomUUID(),
    email,
    email_verified: true,
    name: "Social fixture",
  };
  const start = await call(jar, "/sign-in/social", {
    provider: "google",
    callbackURL: "/app",
  });
  expect(start.status).toBe(200);
  const state = new URL((await start.json()).url).searchParams.get("state");
  return call(jar, `/callback/google?code=fixture-code&state=${state}`);
}

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "fixture-client.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "fixture-google-secret";
  process.env.WHERETO_NO_LISTEN = "true";
  ({ db } = await import("../apps/api/src/db"));
  const { app } = await import("../apps/api/src/server");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(async () => {
  fetchSpy.mockRestore();
  const users = await db?.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  ids.push(...(users ?? []).map((u) => u.id));
  await db?.loginEvent.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { email: { in: emails } }] },
  });
  await db?.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
  });
  await db?.user.deleteMany({ where: { id: { in: ids } } });
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  await db?.$disconnect();
});

describe.sequential("Continue with Google / Apple", () => {
  it("creates the account on first use, stores the link with encrypted tokens and records the method", async () => {
    const email = `social-${randomUUID()}@example.test`;
    emails.push(email);
    const jar = new Jar();
    const done = await continueWithGoogle(jar, email);
    expect(done.status).toBe(302);
    expect(new URL(done.headers.get("location")!, origin).pathname).toBe(
      "/app",
    );
    expect(jar.toString()).toContain("session_token");

    const user = await db.user.findUniqueOrThrow({
      where: { email },
      include: { accounts: true },
    });
    expect(user.emailVerified).toBe(true);
    expect(user.accounts).toHaveLength(1);
    expect(user.accounts[0]).toMatchObject({
      providerId: "google",
      accountId: googleProfile.sub,
    });
    expect(user.accounts[0]!.accessToken).toBeTruthy();
    expect(user.accounts[0]!.accessToken).not.toContain(
      "fixture-google-access-token",
    );
    expect(
      await db.loginEvent.findMany({ where: { userId: user.id } }),
    ).toMatchObject([{ event: "login_success", method: "google" }]);
  });

  it("always keeps Google sign-ins logged in, even after an unticked password sign-in on the same browser", async () => {
    const id = randomUUID();
    const email = `social-${id}@example.test`;
    const password = "Social-fixture-" + randomUUID();
    ids.push(id);
    emails.push(email);
    await db.user.create({
      data: {
        id,
        name: "Social fixture",
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
    const browser = new Jar();
    await call(browser, "/sign-in/email", {
      email,
      password,
      rememberMe: false,
    });
    expect(browser.toString()).toContain("dont_remember");
    const done = await continueWithGoogle(browser, email);
    expect(done.status).toBe(302);
    const setCookies = done.headers.getSetCookie();
    // The last session cookie the browser receives is the one it keeps.
    expect(
      setCookies.filter((c) => c.includes("session_token=")).at(-1),
    ).toMatch(/max-age=2592000/i);
    expect(browser.toString()).not.toContain("dont_remember");
  });

  it("still asks for the authenticator when someone with 2FA continues with Google", async () => {
    const id = randomUUID();
    const email = `social-${id}@example.test`;
    const password = "Social-fixture-" + randomUUID();
    ids.push(id);
    emails.push(email);
    await db.user.create({
      data: {
        id,
        name: "Social fixture",
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
    const owner = new Jar();
    expect(
      (await call(owner, "/sign-in/email", { email, password })).status,
    ).toBe(200);
    const enable = await call(owner, "/two-factor/enable", { password });
    const secret = new TextDecoder().decode(
      base32.decode(
        new URL((await enable.json()).totpURI).searchParams.get("secret")!,
      ),
    );
    expect(
      (
        await call(owner, "/two-factor/verify-totp", {
          code: await createOTP(secret).totp(),
        })
      ).status,
    ).toBe(200);
    const sessionsBefore = await db.session.count({ where: { userId: id } });

    const attacker = new Jar();
    const done = await continueWithGoogle(attacker, email);
    expect(done.status).toBe(302);
    const location = new URL(done.headers.get("location")!, origin);
    expect(location.pathname).toBe("/two-factor");
    expect(location.searchParams.get("next")).toBe("/app");
    expect(attacker.toString()).not.toContain("session_token");
    expect(await db.session.count({ where: { userId: id } })).toBe(
      sessionsBefore,
    );
    // The Google identity is now linked, but it opened no session on its own.
    expect(
      (await db.account.findMany({ where: { userId: id } }))
        .map((a) => a.providerId)
        .sort(),
    ).toEqual(["credential", "google"]);
    expect(
      (
        await realFetch(`${base}/api/v1/me`, {
          headers: { Cookie: attacker.toString() },
        })
      ).status,
    ).toBe(401);

    const passed = await call(attacker, "/two-factor/verify-totp", {
      code: await createOTP(secret).totp(),
    });
    expect(passed.status).toBe(200);
    expect(attacker.toString()).toContain("session_token");
    const events = await db.loginEvent.findMany({
      where: { userId: id, createdAt: { gte: new Date(Date.now() - 60000) } },
      orderBy: { createdAt: "asc" },
      select: { event: true, method: true },
    });
    expect(events.slice(-2)).toEqual([
      { event: "two_factor_required", method: "google" },
      { event: "login_success", method: "google" },
    ]);
  });

  it("signs Apple's client secret with the .p8 key and Apple's required claims", async () => {
    const { appleClientSecret, appleProvider } =
      await import("../apps/api/src/apple-sign-in");
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const key = {
      clientId: "com.whereto.web",
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      // As it usually sits in .env: one line with literal \n.
      privateKey: pem.replace(/\n/g, "\\n"),
    };
    const now = Date.UTC(2026, 9, 28);
    const [header, payload, signature] = appleClientSecret(key, now).split(".");
    expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
      alg: "ES256",
      kid: "KEY1234567",
      typ: "JWT",
    });
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
    expect(claims).toMatchObject({
      iss: "TEAM123456",
      sub: "com.whereto.web",
      aud: "https://appleid.apple.com",
    });
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(15777000);
    expect(
      verify(
        "sha256",
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    ).toBe(true);

    const env = {
      APPLE_CLIENT_ID: key.clientId,
      APPLE_TEAM_ID: key.teamId,
      APPLE_KEY_ID: key.keyId,
      APPLE_PRIVATE_KEY: key.privateKey,
    };
    expect(appleProvider(env)?.clientSecret.split(".")).toHaveLength(3);
    expect(
      appleProvider({ ...env, APPLE_PRIVATE_KEY: "not a key" }),
    ).toBeNull();
    expect(appleProvider({})).toBeNull();
  });
});
