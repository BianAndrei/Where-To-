import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { hashPassword } from "better-auth/crypto";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { defaultPreferences } from "@whereto/shared";

let server: Server, base: string, db: typeof import("../apps/api/src/db").db;
const ids = [randomUUID(), randomUUID()];
const initialNoListen = process.env.WHERETO_NO_LISTEN;
const password = "Settings-fixture-" + randomUUID();
let cookie = "",
  otherCookie = "";
const origin = "http://localhost:5173";
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function request(
  path: string,
  data?: unknown,
  session = cookie,
  method = data === undefined ? "GET" : "POST",
  requestOrigin = origin,
) {
  return fetch(base + path, {
    method,
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/json",
      Cookie: session,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
beforeAll(async () => {
  await import("../apps/api/src/config");
  process.env.WHERETO_NO_LISTEN = "true";
  ({ db } = await import("../apps/api/src/db"));
  const { app } = await import("../apps/api/src/server");
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  for (const id of ids)
    await db.user.create({
      data: {
        id,
        name: "Settings fixture",
        email: `${id}@example.test`,
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
  const login = await request(
    "/api/auth/sign-in/email",
    { email: `${ids[0]}@example.test`, password },
    "",
  );
  expect(login.status).toBe(200);
  cookie = cookies(login);
  const other = await request(
    "/api/auth/sign-in/email",
    { email: `${ids[1]}@example.test`, password },
    "",
  );
  expect(other.status).toBe(200);
  otherCookie = cookies(other);
});
afterAll(async () => {
  await db?.user.deleteMany({ where: { id: { in: ids } } });
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  if (initialNoListen === undefined) delete process.env.WHERETO_NO_LISTEN;
  else process.env.WHERETO_NO_LISTEN = initialNoListen;
  await db?.$disconnect();
});
it("saves only the signed-in user's validated preferences and rejects cross-origin writes", async () => {
  const preferences = {
    ...defaultPreferences,
    currency: "JPY",
    compactNav: true,
    departureCity: "Bucharest",
  };
  expect(
    (await request("/api/v1/me/preferences", preferences, "", "PATCH")).status,
  ).toBe(401);
  expect(
    (
      await request(
        "/api/v1/me/preferences",
        { ...preferences, userId: ids[1] },
        cookie,
        "PATCH",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        "/api/v1/me/preferences",
        { ...preferences, currency: "INVALID" },
        cookie,
        "PATCH",
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await request(
        "/api/v1/me/preferences",
        preferences,
        cookie,
        "PATCH",
        "https://untrusted.example",
      )
    ).status,
  ).toBe(403);
  expect(
    (await request("/api/v1/me/preferences", preferences, cookie, "PATCH"))
      .status,
  ).toBe(200);
  expect((await (await request("/api/v1/me")).json()).preferences).toEqual(
    preferences,
  );
  expect(
    (await (await request("/api/v1/me", undefined, otherCookie)).json())
      .preferences,
  ).toEqual(defaultPreferences);
});
it("updates a profile and password using the real authentication service, revoking other sessions", async () => {
  const second = await request(
    "/api/auth/sign-in/email",
    { email: `${ids[0]}@example.test`, password },
    "",
  );
  const secondCookie = cookies(second);
  expect(
    (await request("/api/auth/update-user", { name: "Alex Adventure" })).status,
  ).toBe(200);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: ids[0] } })).name,
  ).toBe("Alex Adventure");
  expect(
    (
      await request("/api/auth/change-password", {
        currentPassword: "wrong-password",
        newPassword: password + "new",
      })
    ).status,
  ).not.toBe(200);
  const change = await request("/api/auth/change-password", {
    currentPassword: password,
    newPassword: password + "new",
    revokeOtherSessions: true,
  });
  expect(change.status).toBe(200);
  if (cookies(change)) cookie = cookies(change);
  expect((await request("/api/v1/me", undefined, secondCookie)).status).toBe(
    401,
  );
  expect((await request("/api/v1/me")).status).toBe(200);
});
it("enables and verifies an authenticator, then disables it with the current password", async () => {
  const enable = await request("/api/auth/two-factor/enable", {
    password: password + "new",
    issuer: "Whereto",
  });
  expect(enable.status).toBe(200);
  if (cookies(enable)) cookie = cookies(enable);
  const setup = await enable.json();
  expect(setup.backupCodes.length).toBeGreaterThan(0);
  const secret = new TextDecoder().decode(
    base32.decode(new URL(setup.totpURI).searchParams.get("secret")!),
  );
  const code = await createOTP(secret).totp();
  const verify = await request("/api/auth/two-factor/verify-totp", { code });
  expect(verify.status).toBe(200);
  if (cookies(verify)) cookie = cookies(verify);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: ids[0] } }))
      .twoFactorEnabled,
  ).toBe(true);
  expect(
    (
      await request("/api/auth/two-factor/disable", {
        password: password + "new",
      })
    ).status,
  ).toBe(200);
  expect(
    (await db.user.findUniqueOrThrow({ where: { id: ids[0] } }))
      .twoFactorEnabled,
  ).toBe(false);
});
