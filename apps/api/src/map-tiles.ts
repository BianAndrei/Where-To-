import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { assert, db } from "./db.js";
import { sessionUser } from "./access.js";
import { dayPeriod, reserveProvider } from "./providers.js";
import { assertAccountActive } from "./admin-domain.js";
import { recordHealth } from "./integrations.js";

// Bounded in-memory cache. Authorization is checked even for cached tiles.
const cache = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
export async function mapTile(req: Request, res: Response) {
  if (typeof req.query.share === "string") {
    const tokenHash = createHash("sha256")
      .update(req.query.share)
      .digest("hex");
    const link = await db.shareLink.findFirst({
      where: { tokenHash, revokedAt: null, role: "viewer" },
      select: { trip: { select: { ownerId: true } } },
    });
    assert(link, 404, "Share not found.");
    await assertAccountActive(link.trip.ownerId);
  } else await sessionUser(req);
  const {
    z: zoom,
    x,
    y,
  } = z
    .object({
      z: z.coerce.number().int().min(0).max(18),
      x: z.coerce.number().int().min(0),
      y: z.coerce.number().int().min(0),
    })
    .parse(req.params);
  assert(x < 2 ** zoom && y < 2 ** zoom, 400, "Invalid map tile.");
  assert(process.env.GEOAPIFY_API_KEY, 503, "Map services are not connected.");
  const key = `${zoom}/${x}/${y}`;
  let body = cache.get(key);
  if (!body) {
    let request = pending.get(key);
    if (!request) {
      request = (async () => {
        await reserveProvider(
          "geoapify",
          1,
          dayPeriod(),
          Number(process.env.GEOAPIFY_DAILY_CREDITS || 2500),
        );
        const response = await fetch(
          `https://maps.geoapify.com/v1/tile/positron/${key}.png?apiKey=${encodeURIComponent(process.env.GEOAPIFY_API_KEY!)}`,
          { signal: AbortSignal.timeout(12000) },
        );
        assert(response.ok, 503, "Map tiles are temporarily unavailable.");
        await recordHealth("geoapify", response.ok);
        const result = Buffer.from(await response.arrayBuffer());
        assert(result.length < 1024 * 1024, 503, "Invalid map tile.");
        if (cache.size >= 256) cache.delete(cache.keys().next().value!);
        cache.set(key, result);
        return result;
      })();
      pending.set(key, request);
    }
    try {
      body = await request;
    } finally {
      pending.delete(key);
    }
  }
  res.type("png").set("Cache-Control", "private, max-age=300").send(body);
}
