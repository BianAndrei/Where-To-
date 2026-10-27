import { Router } from "express";
import {
  assertAccountActive,
  creditBalance,
  consumeCredit,
  milestone,
  recordAudit,
} from "./admin-domain.js";
import { checkIntegration } from "./integrations.js";
import multer from "multer";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  applyCommand,
  tripStateSchema,
  itemSchema,
  publicTrip,
  suggestOrder,
  orderedItems,
  locationSchema,
  type Command,
  type TripState,
  planningCommands,
  preferencesSchema,
  defaultPreferences,
} from "@whereto/shared";
import { db, assert } from "./db.js";
import { appleSignIn } from "./auth.js";
import { config, featureConfig, localMailbox } from "./config.js";
import {
  sessionUser,
  tripAccess,
  hasPro,
  isUnlimitedOwner,
  menuAllowance,
} from "./access.js";
import {
  searchPlaces,
  trustedPlace,
  route,
  transit,
  reserveProvider,
} from "./providers.js";
import {
  checkout,
  checkoutOutcome,
  paymentHistory,
  portal,
} from "./billing.js";
import { putFile, getFile, deleteFile } from "./storage.js";
import { getQueue } from "./queue.js";
import { mapTile } from "./map-tiles.js";
import { planningApi } from "./planning-api.js";
const json = (v: unknown) => v as Prisma.InputJsonValue;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
const commandSchema = z.discriminatedUnion("type", [
  ...planningCommands,
  z.object({ type: z.literal("item.save"), item: itemSchema }),
  z.object({ type: z.literal("item.delete"), id: z.string() }),
  z.object({ type: z.literal("item.restore"), id: z.string() }),
  z.object({
    type: z.literal("item.order"),
    day: z.string(),
    ids: z.array(z.string()).max(1000),
  }),
  z.object({
    type: z.literal("settings"),
    patch: z
      .object({
        title: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        budget: z.string().nullable().optional(),
        modules: z.enum(["both", "budget", "itinerary"]).optional(),
        saved: z.string().optional(),
        reserve: z.string().optional(),
        categories: z.array(z.string()).optional(),
        departureCity: z.string().optional(),
      })
      .strict(),
  }),
  z.object({
    type: z.literal("participants"),
    participants: z.array(z.object({ id: z.string(), name: z.string() })),
    recalculate: z.boolean(),
  }),
  z.object({
    type: z.literal("checklist"),
    checklist: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        done: z.boolean(),
        group: z.enum(["before", "packing"]),
      }),
    ),
  }),
  z.object({
    type: z.literal("settlement"),
    settlement: z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      amount: z.string(),
      date: z.string(),
    }),
  }),
  z.object({
    type: z.literal("comment"),
    itemId: z.string(),
    text: z.string().min(1).max(2000),
  }),
]);
export const api = Router();
api.use(planningApi);
api.get("/maps/tiles/:z/:x/:y", mapTile);
api.get("/health", async (_req, res) => {
  await db.$queryRaw`SELECT 1`;
  res.json({ ok: true });
});
api.get("/config", (_req, res) =>
  res.json({ ...featureConfig(), appleAuth: appleSignIn }),
);
api.get("/places", async (req, res) => {
  await sessionUser(req);
  const q = z.string().min(2).max(200).parse(req.query.q);
  res.json(
    await searchPlaces(
      q,
      req.query.cities === "true",
      typeof req.query.bias === "string" ? req.query.bias : undefined,
    ),
  );
});
api.get("/dev-mail", async (req, res) => {
  assert(
    localMailbox() &&
      ["localhost", "127.0.0.1"].includes(new URL(config.APP_URL).hostname),
    404,
    "Not found",
  );
  res.json(
    await db.devMail.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  );
});
api.get("/me", async (req, res) => {
  const user = await sessionUser(req);
  const entitlement = await db.entitlement.findUnique({
    where: { userId: user.id },
  });
  res.json({
    user,
    preferences:
      preferencesSchema.safeParse(
        (
          await db.user.findUnique({
            where: { id: user.id },
            select: { preferences: true },
          })
        )?.preferences,
      ).data ?? defaultPreferences,
    entitlement,
    pro: hasPro(entitlement),
    tripCredits: await creditBalance(db, user.id, "trip"),
    unlimitedOwner: await isUnlimitedOwner(user.id),
  });
});
api.patch("/me/preferences", async (req, res) => {
  const user = await sessionUser(req);
  const preferences = preferencesSchema.parse(req.body);
  await db.$transaction(async (tx) => {
    const current = await tx.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { preferences: true },
    });
    const previousKeys =
      current.preferences &&
      typeof current.preferences === "object" &&
      !Array.isArray(current.preferences)
        ? Object.keys(current.preferences)
        : [];
    await tx.user.update({ where: { id: user.id }, data: { preferences } });
    await recordAudit(
      tx,
      user.id,
      "user",
      user.id,
      "preferences.updated",
      { fields: previousKeys },
      { fields: Object.keys(preferences) },
    );
  });
  res.json(preferences);
});
api.get("/trips", async (req, res) => {
  const user = await sessionUser(req);
  const trips = await db.trip.findMany({
    where: {
      owner: { suspendedAt: null },
      OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }],
    },
    include: { members: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(
    trips.map((t) => ({
      ...t,
      role:
        t.ownerId === user.id
          ? "owner"
          : t.members.find((m) => m.userId === user.id)!.role,
      members: undefined,
    })),
  );
});
api.post("/trips", async (req, res) => {
  const user = await sessionUser(req);
  const state = tripStateSchema.parse(req.body);
  assert(
    state.items.length === 0 &&
      state.settlements.length === 0 &&
      state.comments.length === 0 &&
      !state.polls?.length,
    400,
    "New trips must start empty.",
  );
  state.destinations = state.destinations.map(trustedPlace);
  assert(
    state.startDate >= new Date().toISOString().slice(0, 10),
    400,
    "Choose today or a future departure date.",
  );
  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
    const e = await tx.entitlement.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    const unlimitedOwner = await isUnlimitedOwner(user.id, tx);
    const isFree = !unlimitedOwner && !e.freeTripClaimedAt;
    assert(
      unlimitedOwner ||
        isFree ||
        hasPro(e) ||
        (await creditBalance(tx, user.id, "trip")) > 0,
      402,
      "Your first trip is already claimed. Subscribe to create another trip.",
      "SUBSCRIPTION_REQUIRED",
    );
    const trip = await tx.trip.create({
      data: {
        ownerId: user.id,
        state: json(state),
        isFree,
        funding: unlimitedOwner
          ? "admin"
          : isFree
            ? "free"
            : hasPro(e)
              ? "subscription"
              : "bonus",
      },
    });
    if (isFree)
      await tx.entitlement.update({
        where: { userId: user.id },
        data: { freeTripClaimedAt: new Date() },
      });
    if (!unlimitedOwner && !isFree && !hasPro(e))
      await consumeCredit(tx, user.id, "trip", `trip:${trip.id}`);
    await milestone(tx, user.id, "first_trip");
    await recordAudit(
      tx,
      user.id,
      "trip",
      trip.id,
      "trip.created",
      { exists: false },
      { exists: true, version: trip.version, funding: trip.funding },
    );
    return trip;
  });
  res.status(201).json({ ...result, role: "owner" });
});
api.get("/trips/:id", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  res.json({ ...trip, members: undefined });
});
api.post("/trips/:id/commands", async (req, res) => {
  const user = await sessionUser(req);
  const { version, command } = z
    .object({ version: z.number().int(), command: commandSchema })
    .parse(req.body);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  let state: TripState;
  try {
    state = applyCommand(
      trip.state,
      command as Command,
      user.name,
      new Date(),
      { actorId: user.id, owner: trip.role === "owner" },
    );
  } catch (e) {
    assert(false, 400, (e as Error).message);
  }
  assert(
    trip.version === version,
    409,
    "Someone updated this trip. Reload the latest version before saving.",
    "VERSION_CONFLICT",
  );
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.trip.updateMany({
      where: { id: trip.id, version },
      data: { state: json(state), version: { increment: 1 } },
    });
    assert(
      result.count === 1,
      409,
      "Someone updated this trip. Reload the latest version before saving.",
      "VERSION_CONFLICT",
    );
    await tx.tripHistory.create({
      data: {
        tripId: trip.id,
        version: version + 1,
        actor: user.name,
        action: command.type,
      },
    });
    await recordAudit(
      tx,
      user.id,
      "trip",
      trip.id,
      `trip.${command.type}`,
      { version },
      { version: version + 1 },
    );
    if (state.items.some((i) => !i.deletedAt))
      await milestone(tx, trip.ownerId, "first_item");
    if (state.items.some((i) => !i.deletedAt && i.lines.length > 0))
      await milestone(tx, trip.ownerId, "first_cost");
    return tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
  });
  res.json({ ...updated, role: trip.role });
});
api.post("/trips/:id/archive", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  assert(trip.role === "owner", 403, "Only the owner can archive a trip.");
  const { archived } = z.object({ archived: z.boolean() }).parse(req.body);
  const updated = await db.$transaction(async (tx) => {
    const result = await tx.trip.update({
      where: { id: trip.id },
      data: { archivedAt: archived ? new Date() : null },
    });
    await recordAudit(
      tx,
      user.id,
      "trip",
      trip.id,
      archived ? "trip.archived" : "trip.unarchived",
      { archived: !!trip.archivedAt },
      { archived },
    );
    return result;
  });
  res.json(updated);
});
api.delete("/trips/:id", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  assert(trip.role === "owner", 403, "Only the owner can delete a trip.");
  const activeJob = await db.job.findFirst({
    where: {
      tripId: trip.id,
      status: { in: ["queued", "processing", "waiting"] },
    },
    select: { id: true },
  });
  assert(
    !activeJob,
    409,
    "Wait for active trip imports or exports to finish before deleting this trip.",
    "TRIP_JOBS_ACTIVE",
  );
  const [documents, jobs] = await Promise.all([
    db.document.findMany({
      where: { tripId: trip.id },
      select: { storageKey: true },
    }),
    db.job.findMany({
      where: { tripId: trip.id, type: "export", status: "completed" },
      select: { output: true },
    }),
  ]);
  const storageKeys = new Set(documents.map((document) => document.storageKey));
  for (const job of jobs) {
    const output = job.output;
    if (
      output &&
      typeof output === "object" &&
      !Array.isArray(output) &&
      typeof output.storageKey === "string"
    )
      storageKeys.add(output.storageKey);
  }
  const cleanup = await Promise.allSettled(
    [...storageKeys].map((key) => deleteFile(key)),
  );
  assert(
    cleanup.every((result) => result.status === "fulfilled"),
    503,
    "Trip files could not be removed, so the trip was kept. Try again when storage is available.",
    "TRIP_STORAGE_CLEANUP_FAILED",
  );
  const freeTripReplacementRestored = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;
    const current = await tx.trip.findUnique({ where: { id: trip.id } });
    assert(current?.ownerId === user.id, 404, "Trip not found.");
    const entitlement = await tx.entitlement.findUnique({
      where: { userId: user.id },
    });
    const restoreReplacement =
      current.isFree &&
      !!entitlement?.freeTripClaimedAt &&
      !entitlement.freeTripReplacementUsedAt;
    if (restoreReplacement)
      await tx.entitlement.update({
        where: { userId: user.id },
        data: {
          freeTripClaimedAt: null,
          freeTripReplacementUsedAt: new Date(),
        },
      });
    await recordAudit(
      tx,
      user.id,
      "trip",
      current.id,
      "trip.deleted",
      { exists: true, version: current.version },
      { exists: false },
    );
    await tx.trip.delete({ where: { id: current.id } });
    return restoreReplacement;
  });
  res.json({ ok: true, freeTripReplacementRestored });
});
api.get("/trips/:id/history", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  res.json(
    await db.tripHistory.findMany({
      where: { tripId: trip.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  );
});
api.post("/trips/:id/suggest-order", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  const { day } = z.object({ day: z.string() }).parse(req.body);
  const accommodation = trip.state.items.find(
    (i) =>
      !i.deletedAt &&
      i.state !== "idea" &&
      i.kind === "accommodation" &&
      i.day &&
      i.day <= day &&
      (!i.endDay || i.endDay >= day),
  );
  res.json({
    ids: suggestOrder(
      orderedItems(trip.state, day),
      accommodation?.location ?? trip.state.destinations[0],
    ),
    basis: "Geographical proximity; fixed reservations stay in place.",
  });
});
api.post("/routes", async (req, res) => {
  await sessionUser(req);
  const body = z
    .object({
      a: locationSchema,
      b: locationSchema,
      mode: z.enum(["walk", "drive"]).default("walk"),
    })
    .parse(req.body);
  res.json(await route(body.a, body.b, body.mode));
});
api.post("/transit", async (req, res) => {
  await sessionUser(req);
  const body = z
    .object({
      a: locationSchema,
      b: locationSchema,
      departure: z.string().datetime(),
    })
    .parse(req.body);
  res.json(await transit(body.a, body.b, body.departure));
});
api.get("/rates", async (req, res) => {
  await sessionUser(req);
  const { base, quote, date } = z
    .object({
      base: z.string().regex(/^[A-Z]{3}$/),
      quote: z.string().regex(/^[A-Z]{3}$/),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    })
    .parse(req.query);
  const response = await fetch(
    `https://api.frankfurter.dev/v2/rate/${base}/${quote}${date ? `?date=${date}` : ""}`,
    { signal: AbortSignal.timeout(10000) },
  );
  assert(response.ok, 503, "Exchange rate unavailable. Enter your own rate.");
  res.json(await response.json());
});
api.post("/google-places-session", async (req, res) => {
  await sessionUser(req);
  assert(
    process.env.GOOGLE_MAPS_API_KEY,
    503,
    "Google place discovery is not connected.",
    "NOT_CONFIGURED",
  );
  await reserveProvider(
    "google-places",
    1,
    new Date().toISOString().slice(0, 7),
    Number(process.env.GOOGLE_PLACES_MONTHLY_REQUESTS || 5000),
  );
  res.json({ key: process.env.GOOGLE_MAPS_API_KEY });
});
api.post("/billing/checkout", async (req, res) => {
  const user = await sessionUser(req);
  res.json(
    await checkout(user, z.enum(["monthly", "annual"]).parse(req.body.plan)),
  );
});
api.get("/billing/checkout/:sessionId", async (req, res) => {
  const user = await sessionUser(req);
  res.set("Cache-Control", "no-store");
  res.json(await checkoutOutcome(user.id, String(req.params.sessionId)));
});
api.get("/billing/payments", async (req, res) => {
  const user = await sessionUser(req);
  res.set("Cache-Control", "no-store");
  res.json(await paymentHistory(user.id));
});
api.post("/billing/portal", async (req, res) => {
  const user = await sessionUser(req);
  res.json(await portal(user.id));
});
api.post("/trips/:id/shares", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  assert(trip.role === "owner", 403, "Only the owner can manage sharing.");
  const body = z
    .object({
      role: z.enum(["viewer", "editor"]),
      showBudget: z.boolean().default(false),
      showAccommodation: z.boolean().default(false),
    })
    .parse(req.body);
  const token = randomBytes(32).toString("base64url");
  const link = await db.$transaction(async (tx) => {
    const created = await tx.shareLink.create({
      data: { tripId: trip.id, tokenHash: hash(token), ...body },
    });
    await recordAudit(
      tx,
      user.id,
      "trip",
      trip.id,
      "trip.share_created",
      {
        activeLinks:
          (await tx.shareLink.count({ where: { tripId: trip.id } })) - 1,
      },
      {
        role: body.role,
        showBudget: body.showBudget,
        showAccommodation: body.showAccommodation,
      },
    );
    return created;
  });
  res.json({
    id: link.id,
    url: `${config.APP_URL}/${body.role === "editor" ? "join" : "share"}/${token}`,
  });
});
api.get("/trips/:id/shares", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  assert(trip.role === "owner", 403, "Only the owner can manage sharing.");
  const links = await db.shareLink.findMany({
    where: { tripId: trip.id, revokedAt: null },
  });
  res.json(links.map(({ tokenHash, ...l }) => l));
});
api.delete("/trips/:id/shares/:linkId", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  assert(trip.role === "owner", 403, "Only the owner can manage sharing.");
  await db.$transaction(async (tx) => {
    const result = await tx.shareLink.updateMany({
      where: { id: String(req.params.linkId), tripId: trip.id },
      data: { revokedAt: new Date() },
    });
    if (result.count)
      await recordAudit(
        tx,
        user.id,
        "trip",
        trip.id,
        "trip.share_revoked",
        { active: true },
        { active: false },
      );
  });
  res.json({ ok: true });
});
api.get("/share/:token", async (req, res) => {
  const link = await db.shareLink.findUnique({
    where: { tokenHash: hash(String(req.params.token)) },
    include: { trip: true },
  });
  assert(
    link && !link.revokedAt && link.role === "viewer",
    404,
    "This share link is no longer available.",
  );
  await assertAccountActive(link.trip.ownerId);
  res.json({
    id: link.trip.id,
    version: link.trip.version,
    state: publicTrip(
      link.trip.state as unknown as TripState,
      link.showBudget,
      link.showAccommodation,
    ),
    role: "viewer",
    public: true,
    showBudget: link.showBudget,
  });
});
api.post("/join/:token", async (req, res) => {
  const user = await sessionUser(req);
  const link = await db.shareLink.findUnique({
    where: { tokenHash: hash(String(req.params.token)) },
  });
  assert(
    link && !link.revokedAt && link.role === "editor",
    404,
    "This invitation is no longer available.",
  );
  const owner = await db.trip.findUniqueOrThrow({
    where: { id: link.tripId },
    select: { ownerId: true },
  });
  await assertAccountActive(owner.ownerId);
  await db.$transaction(async (tx) => {
    const existing = await tx.tripMember.findUnique({
      where: { tripId_userId: { tripId: link.tripId, userId: user.id } },
      select: { role: true },
    });
    await tx.tripMember.upsert({
      where: { tripId_userId: { tripId: link.tripId, userId: user.id } },
      create: { tripId: link.tripId, userId: user.id, role: "editor" },
      update: {},
    });
    if (!existing)
      await recordAudit(
        tx,
        user.id,
        "trip",
        link.tripId,
        "trip.collaborator_joined",
        { member: false },
        { member: true, role: "editor" },
      );
  });
  res.json({ tripId: link.tripId });
});
api.get("/trips/:id/documents", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  res.json(
    (await db.document.findMany({ where: { tripId: trip.id } })).map(
      ({ storageKey, ...d }) => d,
    ),
  );
});
api.get("/trips/:id/members", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  assert(
    trip.role === "owner",
    403,
    "Only the owner can manage collaborators.",
  );
  const members = await db.tripMember.findMany({
    where: { tripId: trip.id },
    select: { userId: true, role: true, user: { select: { name: true } } },
  });
  res.json(members);
});
api.delete("/trips/:id/members/:memberId", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  assert(
    trip.role === "owner",
    403,
    "Only the owner can manage collaborators.",
  );
  await db.$transaction(async (tx) => {
    const result = await tx.tripMember.deleteMany({
      where: { tripId: trip.id, userId: String(req.params.memberId) },
    });
    if (result.count)
      await recordAudit(
        tx,
        user.id,
        "trip",
        trip.id,
        "trip.collaborator_removed",
        { member: true },
        { member: false },
      );
  });
  res.json({ ok: true });
});
api.post("/trips/:id/documents", upload.single("file"), async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  const file = req.file;
  assert(file, 400, "Choose a file.");
  const mime = detectFile(file.buffer);
  assert(mime, 400, "Upload a PDF, PNG, JPEG or WebP file.");
  if (req.body.itemId)
    assert(
      trip.state.items.some((i) => i.id === req.body.itemId),
      400,
      "Reservation not found.",
    );
  const usage = await db.document.aggregate({
    where: { tripId: trip.id },
    _sum: { size: true },
  });
  assert(
    (usage._sum.size ?? 0) + file.size <= 100 * 1024 * 1024,
    413,
    "This trip has reached its 100 MB document allowance.",
  );
  const key = `documents/${trip.id}/${randomBytes(16).toString("hex")}`;
  await putFile(key, file.buffer, mime);
  const doc = await db.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        tripId: trip.id,
        itemId: req.body.itemId || null,
        name: file.originalname.replace(/[\r\n]/g, "").slice(0, 180),
        mime,
        size: file.size,
        storageKey: key,
      },
    });
    await recordAudit(
      tx,
      user.id,
      "document",
      created.id,
      "document.created",
      { exists: false },
      { exists: true, mime, size: file.size },
    );
    return created;
  });
  res.status(201).json({ ...doc, storageKey: undefined });
});
api.get("/documents/:id/download", async (req, res) => {
  const user = await sessionUser(req);
  const doc = await db.document.findUnique({
    where: { id: String(req.params.id) },
  });
  assert(doc, 404, "Document not found.");
  await tripAccess(doc.tripId, user.id);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", doc.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
  );
  res.send(await getFile(doc.storageKey));
});
api.delete("/documents/:id", async (req, res) => {
  const user = await sessionUser(req);
  const doc = await db.document.findUnique({
    where: { id: String(req.params.id) },
  });
  assert(doc, 404, "Document not found.");
  await tripAccess(doc.tripId, user.id, true);
  await db.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: doc.id } });
    await recordAudit(
      tx,
      user.id,
      "document",
      doc.id,
      "document.deleted",
      { exists: true, mime: doc.mime, size: doc.size },
      { exists: false },
    );
  });
  await deleteFile(doc.storageKey);
  res.json({ ok: true });
});
api.get("/trips/:id/menus", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  res.json({
    menus: await db.menu.findMany({
      where: { tripId: trip.id },
      orderBy: { createdAt: "desc" },
    }),
    allowance: await menuAllowance(trip.ownerId, trip.isFree),
  });
});
api.post("/trips/:id/menus/import", upload.single("file"), async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id, true);
  assert(
    process.env.GROQ_API_KEY,
    503,
    "Menu translation is not connected. Add a meal estimate manually.",
    "NOT_CONFIGURED",
  );
  const itemId = z.string().parse(req.body.itemId);
  assert(
    trip.state.items.some(
      (i) => i.id === itemId && i.kind === "restaurant" && !i.deletedAt,
    ),
    400,
    "Choose a restaurant in this trip.",
  );
  const source = req.file
    ? req.file.originalname
    : z.string().url().max(2000).parse(req.body.url);
  const sourceHash = createHash("sha256")
    .update(req.file?.buffer ?? source)
    .digest("hex");
  const existing = await db.menu.findUnique({
    where: { tripId_sourceHash: { tripId: trip.id, sourceHash } },
  });
  if (existing) {
    res.json({ menu: existing });
    return;
  }
  const allowance = await menuAllowance(trip.ownerId, trip.isFree);
  await checkIntegration("groq-tokens");
  await checkIntegration("storage");
  assert(
    allowance.unlimited || (allowance.remaining ?? 0) > 0,
    402,
    "Your menu import allowance is used up. You can still enter a meal estimate.",
    "MENU_QUOTA",
  );
  let storageKey: string | undefined;
  if (req.file) {
    const mime = detectFile(req.file.buffer);
    assert(mime, 400, "Upload a PDF, PNG, JPEG or WebP menu.");
    storageKey = `imports/${trip.id}/${randomBytes(16).toString("hex")}`;
    await putFile(storageKey, req.file.buffer, mime);
  }
  const job = await db.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: {
        tripId: trip.id,
        type: "menu",
        input: json({
          itemId,
          source,
          sourceHash,
          storageKey,
          bucket: allowance.bucket,
          ownerId: trip.ownerId,
        }),
      },
    });
    await recordAudit(
      tx,
      user.id,
      "trip",
      trip.id,
      "trip.menu_import_requested",
      { activeJob: false },
      { activeJob: true, jobId: created.id },
    );
    return created;
  });
  const queue = await getQueue();
  await queue.send(
    "menu-import",
    { id: job.id },
    { retryLimit: 4, retryDelay: 60, retryBackoff: true },
  );
  res.status(202).json(job);
});
api.post("/trips/:id/exports", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  await checkIntegration("geoapify");
  await checkIntegration("storage");
  const options = z
    .object({
      format: z.enum(["pdf", "png"]),
      day: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      showBudget: z.boolean().default(true),
      showAccommodation: z.boolean().default(true),
    })
    .parse(req.body);
  assert(
    !options.day ||
      (options.day >= trip.state.startDate &&
        options.day <= trip.state.endDate),
    400,
    "Choose a day within this trip.",
  );
  const job = await db.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: { tripId: trip.id, type: "export", input: json(options) },
    });
    await recordAudit(
      tx,
      user.id,
      "trip",
      trip.id,
      "trip.export_requested",
      { activeJob: false },
      { activeJob: true, jobId: created.id, format: options.format },
    );
    return created;
  });
  await (
    await getQueue()
  ).send("trip-export", { id: job.id }, { retryLimit: 2, retryDelay: 30 });
  res.status(202).json(job);
});
api.get("/trips/:id/jobs", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  const jobs = await db.job.findMany({
    where: { tripId: trip.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  res.json(
    jobs.map((j) => ({
      ...j,
      input: undefined,
      output: j.status === "completed" ? j.output : null,
    })),
  );
});
api.get("/jobs/:id/download", async (req, res) => {
  const user = await sessionUser(req);
  const job = await db.job.findUnique({ where: { id: String(req.params.id) } });
  assert(
    job && job.status === "completed" && job.type === "export",
    404,
    "Export is not ready.",
  );
  await tripAccess(job.tripId, user.id);
  const out = job.output as any;
  res.setHeader("Content-Type", out.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${out.filename}"`,
  );
  res.send(await getFile(out.storageKey));
});
export function detectFile(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return "image/jpeg";
  if (
    buffer.subarray(0, 4).toString() === "RIFF" &&
    buffer.subarray(8, 12).toString() === "WEBP"
  )
    return "image/webp";
  return null;
}
