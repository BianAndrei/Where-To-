import { beforeAll, afterAll, it, expect, describe } from "vitest";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import {
  freeTripState,
  newItem,
  flightSchema,
  parseReservationText,
} from "@whereto/shared";
import { deleteFile } from "../apps/api/src/storage";
import exampleFlight from "../apps/web/src/lib/example-flight.json";
import { catalogue } from "../apps/api/src/catalogue";
const db = new PrismaClient();
const origin = "http://localhost:5173";
const userIds: string[] = [];
const emails: string[] = [];
const headers = { Origin: origin, "Content-Type": "application/json" };
async function request(path: string, cookie = "", data?: unknown) {
  return fetch(origin + "/api/v1" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { ...headers, Cookie: cookie },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
async function createUser() {
  const email = `whereto-test-${randomUUID()}@example.test`,
    password = randomUUID() + "Aa!";
  emails.push(email);
  const response = await fetch(origin + "/api/auth/sign-up/email", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Test traveller",
      email,
      password,
      callbackURL: origin + "/app",
    }),
  });
  expect(response.status).toBe(200);
  const data = await response.json();
  userIds.push(data.user.id);
  const mail = await db.devMail.findFirstOrThrow({
    where: { to: email },
    orderBy: { createdAt: "desc" },
  });
  const verification = await fetch(mail.url, {
    redirect: "manual",
    headers: { Origin: origin },
  });
  expect([200, 302]).toContain(verification.status);
  const signin = await fetch(origin + "/api/auth/sign-in/email", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  });
  expect(signin.status).toBe(200);
  const cookie = signin.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token");
  return { cookie, id: data.user.id };
}
let owner: { cookie: string; id: string },
  other: { cookie: string; id: string },
  trip: any;
beforeAll(async () => {
  if (process.env.RESEND_API_KEY)
    throw new Error(
      "Integration tests require local dev mail; no real emails are sent.",
    );
  expect((await request("/health")).status).toBe(200);
  owner = await createUser();
  other = await createUser();
});
afterAll(async () => {
  // Only disposable accounts created by this test run are removed.
  const docs = await db.document.findMany({
    where: { trip: { ownerId: { in: userIds } } },
  });
  for (const doc of docs) await deleteFile(doc.storageKey);
  await db.trip.deleteMany({ where: { ownerId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.devMail.deleteMany({ where: { to: { in: emails } } });
  await db.$disconnect();
});
describe.sequential("Real PostgreSQL and authenticated HTTP acceptance", () => {
  it("grants only one free trip under simultaneous creation", async () => {
    const state = freeTripState({
      organizer: "Test traveller",
      destinations: [catalogue[0]!],
      startDate: "2027-05-12",
      endDate: "2027-05-16",
      participants: [
        { id: "person1", name: "Test traveller" },
        { id: "person2", name: "Guest" },
      ],
      currency: "EUR",
      budget: "1500",
      modules: "both",
    });
    const responses = await Promise.all([
      request("/trips", owner.cookie, state),
      request("/trips", owner.cookie, state),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 402]);
    trip = await responses.find((r) => r.status === 201)!.json();
    expect(trip.isFree).toBe(true);
  });
  it("restores exactly one replacement free trip after deletion", async () => {
    const replacementOwner = await createUser();
    const state = freeTripState({
      organizer: "Test traveller",
      destinations: [catalogue[0]!],
      startDate: "2027-05-12",
      endDate: "2027-05-16",
      participants: [
        { id: "person1", name: "Test traveller" },
        { id: "person2", name: "Guest" },
      ],
      currency: "EUR",
      budget: "1500",
      modules: "both",
    });
    const firstResponse = await request(
      "/trips",
      replacementOwner.cookie,
      state,
    );
    expect(firstResponse.status).toBe(201);
    const firstTrip = await firstResponse.json();
    const deleteFirst = await fetch(`${origin}/api/v1/trips/${firstTrip.id}`, {
      method: "DELETE",
      headers: { ...headers, Cookie: replacementOwner.cookie },
    });
    expect(deleteFirst.status).toBe(200);
    expect(await deleteFirst.json()).toEqual({
      ok: true,
      freeTripReplacementRestored: true,
    });
    const entitlement = await (
      await request("/me", replacementOwner.cookie)
    ).json();
    expect(entitlement.entitlement.freeTripClaimedAt).toBeNull();
    expect(entitlement.entitlement.freeTripReplacementUsedAt).not.toBeNull();

    const replacementResponse = await request(
      "/trips",
      replacementOwner.cookie,
      state,
    );
    expect(replacementResponse.status).toBe(201);
    const replacementTrip = await replacementResponse.json();
    expect(replacementTrip.isFree).toBe(true);
    const deleteReplacement = await fetch(
      `${origin}/api/v1/trips/${replacementTrip.id}`,
      {
        method: "DELETE",
        headers: { ...headers, Cookie: replacementOwner.cookie },
      },
    );
    expect(deleteReplacement.status).toBe(200);
    expect(await deleteReplacement.json()).toEqual({
      ok: true,
      freeTripReplacementRestored: false,
    });
    expect(
      (await request("/trips", replacementOwner.cookie, state)).status,
    ).toBe(402);
  });
  it("denies access to another account and rejects destination changes", async () => {
    expect((await request(`/trips/${trip.id}`, other.cookie)).status).toBe(404);
    const response = await request(`/trips/${trip.id}/commands`, owner.cookie, {
      version: trip.version,
      command: { type: "settings", patch: { destinations: [catalogue[1]] } },
    });
    expect(response.status).toBe(400);
  });
  it("saves the single item ledger, rejects stale writes and preserves work", async () => {
    const item = newItem(trip.state, trip.state.startDate);
    item.title = "Acceptance activity";
    item.lines = [
      {
        id: "line",
        label: "4 adults",
        unit: "person",
        price: "30",
        quantity: "4",
        multiplier: "1",
        currency: "EUR",
        rate: "1",
        rateDate: trip.state.startDate,
        status: "estimated",
      },
    ];
    const response = await request(`/trips/${trip.id}/commands`, owner.cookie, {
      version: trip.version,
      command: { type: "item.save", item },
    });
    expect(response.status).toBe(200);
    trip = await response.json();
    expect(
      (
        await request(`/trips/${trip.id}/commands`, owner.cookie, {
          version: trip.version - 1,
          command: { type: "settings", patch: { title: "Stale overwrite" } },
        })
      ).status,
    ).toBe(409);
    expect(
      (await (await request(`/trips/${trip.id}`, owner.cookie)).json()).state
        .items,
    ).toHaveLength(1);
  });
  it("persists flight segments through authenticated API and rejects invalid times", async () => {
    const item = newItem(trip.state, trip.state.startDate);
    item.title = "Flight acceptance";
    item.kind = "flight";
    item.flight = flightSchema.parse(exampleFlight);
    item.flight.bookingReference = "PRIVATEPNR";
    item.flight.segments.forEach((s) => {
      s.departure.localTime = s.departure.localTime!.replace(
        "2026-10-12",
        "2027-05-12",
      );
      s.arrival.localTime = s.arrival.localTime!.replace(
        "2026-10-12",
        "2027-05-12",
      );
    });
    const response = await request(`/trips/${trip.id}/commands`, owner.cookie, {
      version: trip.version,
      command: { type: "item.save", item },
    });
    expect(response.status).toBe(200);
    trip = await response.json();
    const saved = (
      await (await request(`/trips/${trip.id}`, owner.cookie)).json()
    ).state.items.find((i: any) => i.id === item.id);
    expect(saved.flight.segments).toHaveLength(2);
    expect(saved.endLocation.name).toContain("LIS");
    expect(saved.duration).toBe(445);
    item.flight.segments[1]!.departure.localTime = "2027-05-12T01:00";
    expect(
      (
        await request(`/trips/${trip.id}/commands`, owner.cookie, {
          version: trip.version,
          command: { type: "item.save", item },
        })
      ).status,
    ).toBe(400);
  });
  it("imports a confirmation and private document atomically, with retry and concurrent duplicate protection", async () => {
    const text = `Hotel: Test guesthouse\nCheck-in: ${trip.state.startDate} 15:00\nCheck-out: ${trip.state.endDate}\nTotal: EUR 420.00\nBooking reference: PRIVATE-IMPORT-REF`;
    const { draft } = parseReservationText(text, "accommodation", trip.state);
    draft.reservation = {
      fingerprint: "a".repeat(64),
      reference: "PRIVATE-IMPORT-REF",
      source: "text",
      importedAt: new Date().toISOString(),
    };
    const payload = {
      version: trip.version,
      command: { type: "item.save", item: draft },
      text,
    };
    const submit = (cookie: string, value = payload) => {
      const body = new FormData();
      body.append("payload", JSON.stringify(value));
      return fetch(origin + `/api/v1/trips/${trip.id}/planning/import`, {
        method: "POST",
        headers: { Origin: origin, Cookie: cookie },
        body,
      });
    };
    expect((await submit(other.cookie)).status).toBe(404);
    const results = await Promise.all([
      submit(owner.cookie),
      submit(owner.cookie),
    ]);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(
      results.every((r) => [200, 409].includes(r.status)),
      JSON.stringify(
        await Promise.all(
          results.map(async (r) => ({
            status: r.status,
            body: await r.clone().json(),
          })),
        ),
      ),
    ).toBe(true);
    trip = await (await request(`/trips/${trip.id}`, owner.cookie)).json();
    expect(
      trip.state.items.filter((i: any) => i.title === draft.title),
    ).toHaveLength(1);
    const docs = await db.document.findMany({
      where: { tripId: trip.id, itemId: draft.id },
    });
    expect(docs).toHaveLength(1);
    const retry = await submit(owner.cookie);
    expect(retry.status).toBe(200);
    expect(
      await db.document.count({ where: { tripId: trip.id, itemId: draft.id } }),
    ).toBe(1);
    expect(
      (await request(`/documents/${docs[0]!.id}/download`, other.cookie))
        .status,
    ).toBe(404);
    const download = await request(
      `/documents/${docs[0]!.id}/download`,
      owner.cookie,
    );
    expect(await download.text()).toBe(text);
    const duplicate = await submit(owner.cookie, {
      ...payload,
      version: trip.version,
      command: { ...payload.command, item: { ...draft, id: randomUUID() } },
    });
    expect(duplicate.status).toBe(409);
  });
  it("updates an existing meal with a receipt atomically and keeps its original payment and private source", async () => {
    const item = {
      ...newItem(trip.state, trip.state.startDate),
      title: "Receipt test lunch",
      kind: "restaurant",
      payments: [
        {
          id: "receipt-test-payment",
          payerId: trip.state.participants[0].id,
          amount: "10",
          currency: "EUR",
          rate: "1",
          rateDate: trip.state.startDate,
          kind: "payment",
          note: "Deposit",
        },
      ],
    };
    let response = await request(`/trips/${trip.id}/commands`, owner.cookie, {
      version: trip.version,
      command: { type: "item.save", item },
    });
    expect(response.status).toBe(200);
    trip = await response.json();
    const beforeCount = trip.state.items.length;
    const payload = {
      version: trip.version,
      text: "Private receipt\nPasta 14.00\nTotal EUR 14.00",
      command: {
        type: "receipt.save",
        itemId: item.id,
        receipt: {
          fingerprint: "e".repeat(64),
          currency: "EUR",
          rate: "1",
          rateDate: trip.state.startDate,
          total: "14",
          rows: [
            {
              id: "row",
              label: "Private pasta",
              kind: "purchase",
              amount: "14",
              participantIds: [trip.state.participants[0].id],
            },
          ],
        },
      },
    };
    const submit = () => {
      const body = new FormData();
      body.append("payload", JSON.stringify(payload));
      return fetch(origin + `/api/v1/trips/${trip.id}/planning/import`, {
        method: "POST",
        headers: { Origin: origin, Cookie: owner.cookie },
        body,
      });
    };
    const results = await Promise.all([submit(), submit()]);
    expect(results.some((r) => r.status === 200)).toBe(true);
    expect(results.every((r) => [200, 409].includes(r.status))).toBe(true);
    expect((await submit()).status).toBe(200);
    payload.command.receipt.rows[0]!.label = "Changed after the saved version";
    expect((await submit()).status).toBe(409);
    trip = await (await request(`/trips/${trip.id}`, owner.cookie)).json();
    const saved = trip.state.items.find((i: any) => i.id === item.id);
    expect(trip.state.items.length).toBe(beforeCount);
    expect(saved.lines).toHaveLength(1);
    expect(saved.lines[0].price).toBe("14");
    expect(saved.payments).toEqual(item.payments);
    expect(saved.receipt.fingerprint).not.toBe("e".repeat(64));
    expect(
      await db.document.count({ where: { tripId: trip.id, itemId: item.id } }),
    ).toBe(1);
  });
  it("records authenticated votes, rejects editor confirmation and preserves one winner under concurrent confirmation", async () => {
    await db.tripMember.create({
      data: { tripId: trip.id, userId: other.id, role: "editor" },
    });
    const optionIds: string[] = [];
    for (const title of ["Boat trip", "Aquarium"]) {
      const item = { ...newItem(trip.state), title, state: "idea" };
      optionIds.push(item.id);
      const response = await request(
        `/trips/${trip.id}/commands`,
        owner.cookie,
        { version: trip.version, command: { type: "item.save", item } },
      );
      expect(response.status).toBe(200);
      trip = await response.json();
    }
    let response = await request(`/trips/${trip.id}/commands`, owner.cookie, {
      version: trip.version,
      command: {
        type: "poll.create",
        id: "api-poll",
        question: "Which activity?",
        optionIds,
      },
    });
    expect(response.status).toBe(200);
    trip = await response.json();
    response = await request(`/trips/${trip.id}/commands`, other.cookie, {
      version: trip.version,
      command: {
        type: "poll.vote",
        id: "api-poll",
        optionId: optionIds[1],
        userId: owner.id,
      },
    });
    expect(response.status).toBe(200);
    trip = await response.json();
    expect(trip.state.polls[0].votes[0].userId).toBe(other.id);
    const command = {
      type: "poll.resolve",
      id: "api-poll",
      selectedId: optionIds[1],
      day: trip.state.startDate,
    };
    expect(
      (
        await request(`/trips/${trip.id}/commands`, other.cookie, {
          version: trip.version,
          command,
        })
      ).status,
    ).toBe(400);
    const results = await Promise.all([
      request(`/trips/${trip.id}/commands`, owner.cookie, {
        version: trip.version,
        command,
      }),
      request(`/trips/${trip.id}/commands`, owner.cookie, {
        version: trip.version,
        command,
      }),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    trip = await (await request(`/trips/${trip.id}`, owner.cookie)).json();
    expect(
      trip.state.items.filter(
        (i: any) => optionIds.includes(i.id) && i.state === "planned",
      ),
    ).toHaveLength(1);
    await db.tripMember.delete({
      where: { tripId_userId: { tripId: trip.id, userId: other.id } },
    });
  });
  it("sanitizes public links and revokes them immediately", async () => {
    const response = await request(`/trips/${trip.id}/shares`, owner.cookie, {
      role: "viewer",
    });
    expect(response.status).toBe(200);
    const link = await response.json();
    const token = link.url.split("/").pop();
    const shared = await (await request(`/share/${token}`)).json();
    expect(shared.state.budget).toBeNull();
    expect(shared.state.items[0].lines).toEqual([]);
    expect(shared.state.participants).toEqual([]);
    expect(JSON.stringify(shared)).not.toContain("PRIVATEPNR");
    expect(JSON.stringify(shared)).not.toContain("PRIVATE-IMPORT-REF");
    expect(JSON.stringify(shared)).not.toContain("Private pasta");
    expect(shared.state.polls).toBeUndefined();
    expect(
      shared.state.items.find((i: any) => i.kind === "flight").flight.segments,
    ).toHaveLength(2);
    expect(
      (
        await fetch(origin + `/api/v1/trips/${trip.id}/shares/${link.id}`, {
          method: "DELETE",
          headers: { ...headers, Cookie: owner.cookie },
        })
      ).status,
    ).toBe(200);
    expect((await request(`/share/${token}`)).status).toBe(404);
  });
  it("archiving does not restore the free entitlement, and existing trips stay editable", async () => {
    expect(
      (
        await request(`/trips/${trip.id}/archive`, owner.cookie, {
          archived: true,
        })
      ).status,
    ).toBe(200);
    const state = { ...trip.state, items: [], polls: [] };
    expect((await request("/trips", owner.cookie, state)).status).toBe(402);
    expect(
      (
        await request(`/trips/${trip.id}/commands`, owner.cookie, {
          version: trip.version,
          command: { type: "settings", patch: { title: "Still editable" } },
        })
      ).status,
    ).toBe(200);
  });
});
