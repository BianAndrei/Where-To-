import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
import { freeTripState, newItem } from "@whereto/shared";
import { catalogue } from "../apps/api/src/catalogue";

let server: Server, base: string, db: typeof import("../apps/api/src/db").db;
type Person = { id: string; email: string; password: string; cookie: string };
let admin: Person, owner: Person, viewer: Person, trip: any, secret: string;
const ids: string[] = [],
  emails: string[] = [];
const origin = "http://localhost:5173";
const initialOwner = process.env.ADMIN_OWNER_USER_ID;
const initialControls: any[] = [];
async function request(
  path: string,
  person?: Person,
  body?: unknown,
  method?: string,
) {
  return fetch(base + "/api/v1" + path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(person ? { Cookie: person.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function authRequest(path: string, person?: Person, body?: unknown) {
  return fetch(base + "/api/auth" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(person ? { Cookie: person.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
async function createPerson(): Promise<Person> {
  const p = {
    id: "",
    email: `admin-fixture-${randomUUID()}@example.test`,
    password: randomUUID() + "Aa!",
    cookie: "",
  };
  emails.push(p.email);
  const response = await authRequest("/sign-up/email", undefined, {
    name: "Admin fixture",
    email: p.email,
    password: p.password,
  });
  expect(response.status).toBe(200);
  p.id = (await response.json()).user.id;
  ids.push(p.id);
  // Deliberately local fixture verification; no real mailbox or user's account is modified.
  await db.user.update({ where: { id: p.id }, data: { emailVerified: true } });
  const login = await authRequest("/sign-in/email", undefined, {
    email: p.email,
    password: p.password,
  });
  expect(login.status).toBe(200);
  p.cookie = cookies(login);
  return p;
}
const body = (extra: Record<string, unknown> = {}) => ({
  requestKey: randomUUID(),
  reason: "Local acceptance test intervention",
  ...extra,
});
const action = (name: string, target: string, fields = body()) =>
  request(`/admin/actions/${name}/${target}`, admin, fields);
const state = () =>
  freeTripState({
    organizer: "Fixture",
    destinations: [catalogue[0]!],
    startDate: "2027-07-12",
    endDate: "2027-07-15",
    currency: "EUR",
    budget: "2000",
    modules: "both",
    participants: [{ id: "person1", name: "Fixture" }],
  });

beforeAll(async () => {
  if (process.env.RESEND_API_KEY)
    throw new Error(
      "Admin acceptance requires local mail, not a live email provider.",
    );
  vi.stubEnv("WHERETO_NO_LISTEN", "true");
  vi.stubEnv("GEOAPIFY_API_KEY", "fixture-only-no-network");
  const mod = await import("../apps/api/src/server");
  db = (await import("../apps/api/src/db")).db;
  initialControls.push(...(await db.integrationControl.findMany()));
  await new Promise<void>((resolve) => {
    server = mod.app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
  admin = await createPerson();
  owner = await createPerson();
  viewer = await createPerson();
  process.env.ADMIN_OWNER_USER_ID = admin.id;
}, 30000);

afterAll(async () => {
  if (server)
    await new Promise<void>((resolve) => server.close(() => resolve()));
  if (db) {
    await db.adminAudit.deleteMany({ where: { actorId: { in: ids } } });
    await db.trip.deleteMany({ where: { ownerId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.devMail.deleteMany({ where: { to: { in: emails } } });
    for (const provider of ["groq-tokens", "geoapify", "storage"]) {
      const old = initialControls.find((c) => c.provider === provider);
      if (old)
        await db.integrationControl.upsert({
          where: { provider },
          create: old,
          update: old,
        });
      else await db.integrationControl.deleteMany({ where: { provider } });
    }
    await db.$disconnect();
  }
  if (initialOwner) process.env.ADMIN_OWNER_USER_ID = initialOwner;
  else delete process.env.ADMIN_OWNER_USER_ID;
  vi.unstubAllEnvs();
});

describe.sequential(
  "Private admin acceptance against PostgreSQL and HTTP",
  () => {
    it("rejects unauthenticated, regular and owner-without-TOTP sessions on every section", async () => {
      for (const path of [
        "overview",
        "users",
        "trips",
        "subscriptions",
        "jobs",
        "integrations",
        "activity",
      ]) {
        expect((await request(`/admin/${path}`)).status).toBe(401);
        expect((await request(`/admin/${path}`, owner)).status).toBe(403);
        const response = await request(`/admin/${path}`, admin);
        expect(response.status).toBe(403);
        expect((await response.json()).code).toBe("ADMIN_TOTP_REQUIRED");
      }
      expect(
        (
          await request("/admin/access/enroll", owner, {
            password: owner.password,
          })
        ).status,
      ).toBe(403);
    });
    it("enrolls Better Auth TOTP and independently verifies an admin session", async () => {
      const enrollment = await request("/admin/access/enroll", admin, {
        password: admin.password,
      });
      expect(enrollment.status).toBe(200);
      const data = await enrollment.json();
      secret = new TextDecoder().decode(
        base32.decode(new URL(data.totpURI).searchParams.get("secret")!),
      );
      const code = await createOTP(secret).totp();
      const verify = await authRequest("/two-factor/verify-totp", admin, {
        code,
      });
      expect(verify.status).toBe(200);
      admin.cookie = cookies(verify);
      expect((await request("/admin/overview", admin)).status).toBe(403);
      const proof = await request("/admin/access/verify", admin, { code });
      expect(proof.status).toBe(200);
      expect((await request("/admin/overview", admin)).status).toBe(200);
      expect(
        (await request("/admin/access", admin)).headers.get("cache-control"),
      ).toBe("no-store");
    });
    it("does not grant admin proof to a second session (including an OAuth-style session)", async () => {
      const { auth } = await import("../apps/api/src/auth");
      const { serializeSignedCookie } = createRequire(
        createRequire(import.meta.url).resolve("better-auth"),
      )("better-call");
      const context = await auth.$context;
      const session = await context.internalAdapter.createSession(admin.id);
      const cookie = await serializeSignedCookie(
        context.authCookies.sessionToken.name,
        session.token,
        context.secret,
        { path: "/" },
      );
      const secondary = { ...admin, cookie: cookie.split(";")[0]! };
      expect((await request("/admin/overview", secondary)).status).toBe(403);
      expect(
        (
          await authRequest("/two-factor/get-totp-uri", secondary, {
            password: admin.password,
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await authRequest("/two-factor/disable", secondary, {
            password: admin.password,
          })
        ).status,
      ).toBe(403);
      expect(
        await db.adminProof.findUnique({ where: { sessionId: session.id } }),
      ).toBeNull();
      await db.session.delete({ where: { id: session.id } });
      const saved = await db.adminProof.findFirstOrThrow({
        where: { session: { userId: admin.id } },
      });
      await db.adminProof.update({
        where: { sessionId: saved.sessionId },
        data: { verifiedAt: new Date(Date.now() - 11 * 60000) },
      });
      expect(
        (await action("grant", owner.id, body({ kind: "trip", quantity: 1 })))
          .status,
      ).toBe(403);
      expect((await request("/admin/overview", admin)).status).toBe(200);
      expect(
        (
          await request("/admin/access/verify", admin, {
            code: await createOTP(secret).totp(),
          })
        ).status,
      ).toBe(200);
    });
    it("serializes repeated grants and concurrent trip-credit spending without resetting the free claim", async () => {
      const grantBody = body({ kind: "trip", quantity: 1 });
      const results = await Promise.all([
        action("grant", owner.id, grantBody),
        action("grant", owner.id, grantBody),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(
        await db.creditGrant.count({
          where: { userId: owner.id, kind: "trip" },
        }),
      ).toBe(1);
      expect(
        (await action("grant", owner.id, { ...grantBody, quantity: 5 })).status,
      ).toBe(409);
      const free = await request("/trips", owner, state());
      expect(free.status).toBe(201);
      trip = await free.json();
      expect(trip.funding).toBe("free");
      const before = await db.entitlement.findUniqueOrThrow({
        where: { userId: owner.id },
      });
      const requests = await Promise.all([
        request("/trips", owner, state()),
        request("/trips", owner, state()),
      ]);
      expect(requests.map((r) => r.status).sort()).toEqual([201, 402]);
      const bonus = await requests.find((r) => r.status === 201)!.json();
      expect(bonus.funding).toBe("bonus");
      await request(`/trips/${bonus.id}/archive`, owner, { archived: true });
      expect((await request("/trips", owner, state())).status).toBe(402);
      expect(
        (
          await db.entitlement.findUniqueOrThrow({
            where: { userId: owner.id },
          })
        ).freeTripClaimedAt,
      ).toEqual(before.freeTripClaimedAt);
      const grant = await db.creditGrant.findFirstOrThrow({
        where: { userId: owner.id, kind: "trip" },
      });
      expect(
        (await action("revoke-credit", grant.id, body({ quantity: 1 }))).status,
      ).toBe(409);
    });
    it("keeps admin DTOs and diagnostic errors free of private trip content and raw payloads", async () => {
      const privateText = "PRIVATE_SENTINEL_NEVER_ADMIN";
      const item = newItem(trip.state, trip.state.startDate);
      item.title = privateText;
      item.notes = privateText;
      const save = await request(`/trips/${trip.id}/commands`, owner, {
        version: trip.version,
        command: { type: "item.save", item },
      });
      expect(save.status).toBe(200);
      trip = await save.json();
      await db.job.create({
        data: {
          tripId: trip.id,
          type: "export",
          status: "failed",
          input: { token: privateText },
          output: { storageKey: privateText },
          error: `https://private.example/${privateText}`,
          errorCode: "EXPORT_FAILED",
        },
      });
      for (const section of [
        "users",
        "trips",
        "jobs",
        "subscriptions",
        "overview",
        "integrations",
        "activity",
      ]) {
        const response = await request(`/admin/${section}`, admin);
        expect(response.status).toBe(200);
        const raw = await response.text();
        expect(raw).not.toContain(privateText);
        expect(raw).not.toMatch(
          /"(?:password|secret|backupCodes|token|input|output|storageKey|state|destinations|notes|budget)"\s*:/,
        );
      }
      const trips = await (
        await request(`/admin/trips?user=${owner.id}`, admin)
      ).json();
      expect(trips.rows.find((t: any) => t.id === trip.id)).toMatchObject({
        items: 1,
        destinationsLocked: true,
        datesLocked: false,
      });
    });
    it("suspends sessions and all owned-trip access, then reversibly restores links without changing billing", async () => {
      const share = await (
        await request(`/trips/${trip.id}/shares`, owner, {
          role: "viewer",
          showBudget: false,
          showAccommodation: false,
        })
      ).json();
      const token = new URL(share.url).pathname.split("/").at(-1);
      await db.tripMember.create({
        data: { tripId: trip.id, userId: viewer.id, role: "viewer" },
      });
      expect((await request(`/share/${token}`)).status).toBe(200);
      expect((await action("suspend", owner.id)).status).toBe(200);
      expect((await request(`/share/${token}`)).status).toBe(403);
      expect((await request(`/trips/${trip.id}`, viewer)).status).toBe(403);
      expect((await request("/trips", owner)).status).toBe(401);
      // Wait for the credential endpoint's separate 3-per-10-second limit.
      await new Promise((resolve) => setTimeout(resolve, 10500));
      const signin = await authRequest("/sign-in/email", undefined, {
        email: owner.email,
        password: owner.password,
      });
      expect(signin.status).toBe(403);
      expect((await action("reactivate", owner.id)).status).toBe(200);
      expect((await request(`/share/${token}`)).status).toBe(200);
      expect((await request(`/trips/${trip.id}`, viewer)).status).toBe(200);
      expect((await request("/trips", owner)).status).toBe(401);
      const login = await authRequest("/sign-in/email", undefined, {
        email: owner.email,
        password: owner.password,
      });
      expect(login.status).toBe(200);
      owner.cookie = cookies(login);
      expect(
        (
          await db.entitlement.findUniqueOrThrow({
            where: { userId: owner.id },
          })
        ).subscriptionStatus,
      ).toBe("inactive");
    });
    it("pauses service requests and new job starts, keeps manual editing usable, and enforces hard ceilings", async () => {
      expect(
        (await action("integration", "groq-tokens", body({ paused: true })))
          .status,
      ).toBe(200);
      const { reserveProvider } = await import("../apps/api/src/providers");
      await expect(
        reserveProvider("groq-tokens", 1, "2026-09-08", 180000),
      ).rejects.toMatchObject({ code: "PROVIDER_PAUSED" });
      const job = await db.job.create({
        data: { tripId: trip.id, type: "menu", status: "queued", input: {} },
      });
      const { claimJob } = await import("../apps/api/src/job-runtime");
      expect(await claimJob(job.id)).toBeNull();
      expect(
        (await db.job.findUniqueOrThrow({ where: { id: job.id } })).status,
      ).toBe("waiting");
      const save = await request(`/trips/${trip.id}/commands`, owner, {
        version: trip.version,
        command: {
          type: "settings",
          patch: { title: "Manual planning still works" },
        },
      });
      expect(save.status).toBe(200);
      trip = await save.json();
      expect(
        (await action("integration", "groq-tokens", body({ limit: 999999999 })))
          .status,
      ).toBe(400);
      expect(
        (await action("integration", "groq-tokens", body({ paused: false })))
          .status,
      ).toBe(200);
    });
    it("never retries completed or processing jobs, even if old, and claims queued work only once", async () => {
      const { claimJob } = await import("../apps/api/src/job-runtime");
      for (const status of ["completed", "processing"]) {
        const job = await db.job.create({
          data: {
            tripId: trip.id,
            type: "export",
            status,
            input: {},
            updatedAt: new Date("2020-01-01"),
          },
        });
        expect((await action("retry", job.id)).status).toBe(409);
        expect(await claimJob(job.id)).toBeNull();
      }
      const job = await db.job.create({
        data: { tripId: trip.id, type: "export", status: "queued", input: {} },
      });
      const claims = await Promise.all([claimJob(job.id), claimJob(job.id)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await db.jobAttempt.count({ where: { jobId: job.id } })).toBe(1);
    });
    it("spends normal menu quota before bonus and revokes only the unspent balance", async () => {
      expect(
        (await action("grant", owner.id, body({ kind: "menu", quantity: 2 })))
          .status,
      ).toBe(200);
      const { menuAllowance } = await import("../apps/api/src/access");
      const { consumeCredit, accountLock } =
        await import("../apps/api/src/admin-domain");
      expect(await menuAllowance(owner.id, true)).toMatchObject({
        normalRemaining: 10,
        bonus: 2,
        remaining: 12,
      });
      await db.menu.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          tripId: trip.id,
          ownerId: owner.id,
          itemId: "fixture",
          sourceHash: `fixture-${i}`,
          source: "fixture",
          data: {},
          quotaBucket: "free",
        })),
      });
      expect(await menuAllowance(owner.id, true)).toMatchObject({
        normalRemaining: 0,
        bonus: 2,
        remaining: 2,
      });
      const key = `menu:${randomUUID()}`;
      await Promise.all(
        [1, 2].map(() =>
          db.$transaction((tx) => consumeCredit(tx, owner.id, "menu", key)),
        ),
      );
      expect(await menuAllowance(owner.id, true)).toMatchObject({
        bonus: 1,
        remaining: 1,
      });
      const grant = await db.creditGrant.findFirstOrThrow({
        where: { userId: owner.id, kind: "menu" },
      });
      expect(
        (await action("revoke-credit", grant.id, body({ quantity: 2 }))).status,
      ).toBe(409);
      expect(
        (await action("revoke-credit", grant.id, body({ quantity: 1 }))).status,
      ).toBe(200);
      expect(await menuAllowance(owner.id, true)).toMatchObject({
        bonus: 0,
        remaining: 0,
      });
    });
    it("uses explicit real metric definitions, records interventions, and has no audit edit/delete API", async () => {
      const overview = await (
        await request("/admin/overview?days=7", admin)
      ).json();
      expect(overview.definitions.funnel).toContain(
        "Historical missing events are not inferred",
      );
      const services = await (
        await request("/admin/integrations", admin)
      ).json();
      expect(
        services.rows.find((s: any) => s.id === "groq-tokens"),
      ).toMatchObject({ configured: false, health: "unavailable" });
      const audit = await (
        await request(`/admin/activity?user=${owner.id}`, admin)
      ).json();
      expect(audit.total).toBeGreaterThan(3);
      const id = audit.rows[0].id;
      expect(
        (await request(`/admin/activity/${id}`, admin, undefined, "DELETE"))
          .status,
      ).toBe(404);
      expect(
        (
          await request(
            `/admin/activity/${id}`,
            admin,
            { reason: "rewrite" },
            "PATCH",
          )
        ).status,
      ).toBe(404);
      expect((await request("/admin/users?page=0", admin)).status).toBe(400);
    });
    it("persists failed TOTP attempt limits without exposing codes and rejects foreign origins", async () => {
      const invalid =
        (await createOTP(secret).totp()) === "000000" ? "000001" : "000000";
      for (let n = 0; n < 5; n++)
        expect(
          (await request("/admin/access/verify", admin, { code: invalid }))
            .status,
        ).toBe(400);
      expect(
        (
          await request("/admin/access/verify", admin, {
            code: await createOTP(secret).totp(),
          })
        ).status,
      ).toBe(429);
      const response = await fetch(
        base + `/api/v1/admin/actions/grant/${owner.id}`,
        {
          method: "POST",
          headers: {
            Origin: "https://foreign.example",
            Cookie: admin.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body({ kind: "trip", quantity: 1 })),
        },
      );
      expect(response.status).toBe(403);
      const audits = await db.adminAudit.findMany({
        where: { actorId: admin.id, action: "admin.verify" },
      });
      expect(audits.filter((a) => a.outcome === "failed")).toHaveLength(5);
      expect(JSON.stringify(audits)).not.toContain(invalid);
    });
  },
);
