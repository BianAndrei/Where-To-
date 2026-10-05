import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import {
  applyCommand,
  itemSchema,
  receiptSchema,
  transferNeeds,
  type Command,
  type TripState,
} from "@whereto/shared";
import { db, assert } from "./db.js";
import { sessionUser, tripAccess } from "./access.js";
import { putFile, deleteFile } from "./storage.js";
import { route, transit } from "./providers.js";
import { milestone } from "./admin-domain.js";

export const planningApi = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fieldSize: 500000, fields: 4 },
});
const json = (v: unknown) => v as Prisma.InputJsonValue;
const inputSchema = z.object({
  version: z.number().int().min(1),
  text: z.string().max(100000).default(""),
  command: z.discriminatedUnion("type", [
    z.object({ type: z.literal("item.save"), item: itemSchema }),
    z.object({
      type: z.literal("receipt.save"),
      itemId: z.string().max(100),
      receipt: receiptSchema,
    }),
  ]),
});
planningApi.post(
  "/trips/:id/planning/import",
  async (req, _res, next) => {
    const user = await sessionUser(req);
    await tripAccess(String(req.params.id), user.id, true);
    next();
  },
  upload.single("file"),
  async (req, res) => {
    const user = await sessionUser(req);
    const trip = await tripAccess(String(req.params.id), user.id, true);
    let parsed: unknown;
    try {
      parsed = JSON.parse(req.body.payload);
    } catch {
      assert(false, 400, "Choose a valid import.");
    }
    const input = inputSchema.parse(parsed);
    const file = req.file;
    const buffer = file?.buffer ?? Buffer.from(input.text);
    assert(
      buffer.length > 0,
      400,
      "Include the original confirmation or receipt.",
    );
    let mime = "text/plain";
    if (buffer.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
    else if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
      mime = "image/jpeg";
    else if (
      buffer.subarray(0, 4).toString() === "RIFF" &&
      buffer.subarray(8, 12).toString() === "WEBP"
    )
      mime = "image/webp";
    else
      assert(
        !file || /\.(txt|eml)$/i.test(file.originalname),
        400,
        "Choose a PDF, PNG, JPEG, WebP or text file.",
      );
    const fingerprint = createHash("sha256").update(buffer).digest("hex");
    const command = input.command;
    if (command.type === "item.save") {
      assert(
        command.item.reservation,
        400,
        "Review the reservation before saving.",
      );
      command.item.reservation.fingerprint = fingerprint;
      command.item.reservation.importedAt = new Date().toISOString();
      command.item.reservation.source =
        mime === "application/pdf"
          ? "pdf"
          : mime.startsWith("image/")
            ? "image"
            : "text";
      assert(
        ["accommodation", "transport", "activity", "flight"].includes(
          command.item.kind,
        ),
        400,
        "Choose a supported reservation type.",
      );
    } else command.receipt.fingerprint = fingerprint;
    const itemId =
      command.type === "item.save" ? command.item.id : command.itemId;
    // Repeated successful submission returns the current trip without another document or cost.
    const existing = trip.state.items.find(
      (i) =>
        i.reservation?.fingerprint === fingerprint ||
        i.receipt?.fingerprint === fingerprint,
    );
    if (existing) {
      assert(
        existing.id === itemId,
        409,
        `This file is already attached to “${existing.title}”. Open that item instead.`,
        "DUPLICATE_IMPORT",
      );
      if (trip.version !== input.version) {
        const comparable = (item: typeof existing) => ({
          ...item,
          order: 0,
          reservation: item.reservation
            ? { ...item.reservation, importedAt: "" }
            : undefined,
        });
        const sameResult =
          command.type === "receipt.save"
            ? isDeepStrictEqual(existing.receipt, command.receipt)
            : isDeepStrictEqual(comparable(existing), comparable(command.item));
        assert(
          sameResult,
          409,
          "This imported item has changed. Reload before saving your edits.",
          "VERSION_CONFLICT",
        );
        res.json({ ...trip, members: undefined });
        return;
      }
    }
    assert(
      trip.version === input.version,
      409,
      "The trip changed. Reload it before saving this import.",
      "VERSION_CONFLICT",
    );
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
    const key = `documents/${trip.id}/${randomUUID()}`;
    if (!existing) await putFile(key, buffer, mime);
    try {
      const updated = await db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"documents:" + trip.id}))`;
        if (!existing) {
          const usage = await tx.document.aggregate({
            where: { tripId: trip.id },
            _sum: { size: true },
          });
          assert(
            (usage._sum.size ?? 0) + buffer.length <= 100 * 1024 * 1024,
            413,
            "This trip has reached its 100 MB document allowance.",
          );
        }
        const result = await tx.trip.updateMany({
          where: { id: trip.id, version: input.version },
          data: { state: json(state), version: { increment: 1 } },
        });
        assert(
          result.count === 1,
          409,
          "The trip changed. Reload before saving this import.",
          "VERSION_CONFLICT",
        );
        if (!existing)
          await tx.document.create({
            data: {
              tripId: trip.id,
              itemId,
              name: (
                file?.originalname ??
                (command.type === "receipt.save"
                  ? "Receipt.txt"
                  : "Confirmation.txt")
              )
                .replace(/[\r\n]/g, "")
                .slice(0, 180),
              mime,
              size: buffer.length,
              storageKey: key,
            },
          });
        await tx.tripHistory.create({
          data: {
            tripId: trip.id,
            version: input.version + 1,
            actor: user.name,
            action:
              command.type === "receipt.save"
                ? "receipt.save"
                : "reservation.import",
          },
        });
        await milestone(tx, trip.ownerId, "first_item");
        if (state.items.some((i) => !i.deletedAt && i.lines.length))
          await milestone(tx, trip.ownerId, "first_cost");
        return tx.trip.findUniqueOrThrow({ where: { id: trip.id } });
      });
      res.json({ ...updated, role: trip.role });
    } catch (e) {
      if (!existing) await deleteFile(key).catch(() => {});
      throw e;
    }
  },
);

planningApi.post("/trips/:id/planning/transfers", async (req, res) => {
  const user = await sessionUser(req);
  const trip = await tripAccess(String(req.params.id), user.id);
  const { needId, departure } = z
    .object({ needId: z.string().max(400), departure: z.string().datetime() })
    .parse(req.body);
  const need = transferNeeds(trip.state).find((n) => n.id === needId);
  assert(need, 400, "Choose an airport transfer from this trip.");
  const requests = await Promise.allSettled([
    transit(need.from, need.to, departure, "train"),
    transit(need.from, need.to, departure, "bus"),
    route(need.from, need.to, "drive"),
  ]);
  const options = requests.map((result, index) => {
    const mode = ["train", "bus", "taxi"][index];
    if (result.status === "rejected")
      return {
        mode,
        available: false,
        message:
          "Route information is unavailable. Check an operator and add your estimate below.",
      };
    if (
      index === 2 &&
      Number.isFinite(result.value.minutes) &&
      result.value.minutes > 0
    )
      return {
        mode,
        available: true,
        minutes: Math.ceil(result.value.minutes),
        changes: 0,
        source: "Geoapify · driving route; taxi fare not included",
      };
    const r = result.value.routes?.[0];
    const seconds = Number.parseFloat(r?.duration);
    if (!r || !Number.isFinite(seconds) || seconds <= 0)
      return {
        mode,
        available: false,
        message:
          "No complete route returned for this time. Add a checked estimate below.",
      };
    const steps = (r.legs ?? [])
      .flatMap((l: any) => l.steps ?? [])
      .filter((s: any) => s.transitDetails);
    return {
      mode,
      available: true,
      minutes: Math.ceil(seconds / 60),
      changes: Math.max(0, steps.length - 1),
      source: "Google Maps · transit",
      legs: steps.map((s: any) => ({
        from: s.transitDetails.stopDetails?.departureStop?.name,
        to: s.transitDetails.stopDetails?.arrivalStop?.name,
        line:
          s.transitDetails.transitLine?.nameShort ??
          s.transitDetails.transitLine?.name,
      })),
      fare: r.travelAdvisory?.transitFare ?? null,
    };
  });
  res.json({ options, checkedAt: new Date().toISOString() });
});
