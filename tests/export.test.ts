import { it, expect, vi } from "vitest";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { createRequire } from "node:module";
const { createCanvas, DOMMatrix, ImageData, Path2D } = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
)("@napi-rs/canvas");
vi.mock("../apps/api/src/providers", () => ({
  reserveProvider: vi.fn(),
  dayPeriod: () => new Date().toISOString().slice(0, 10),
}));
import { makeDemo } from "../apps/web/src/lib/demo";
it("produces readable PNG/PDF exports using a labelled test basemap and never calls a live map provider", async () => {
  process.env.DATA_DIR = resolve(".data/export-tests");
  process.env.GEOAPIFY_API_KEY = "fixture-only";
  const { db } = await import("../apps/api/src/db");
  const { processExportJob } = await import("../apps/api/src/export-worker");
  const { getFile, deleteFile } = await import("../apps/api/src/storage");
  const userId = "export-test-" + randomUUID();
  const keys: string[] = [];
  await db.user.create({
    data: {
      id: userId,
      name: "Export test",
      email: userId + "@example.test",
      emailVerified: true,
    },
  });
  const state = makeDemo().state;
  state.title = "Export layout test · Lisbon";
  const trip = await db.trip.create({
    data: { ownerId: userId, state: state as any },
  });
  const fixture = await sharp(
    Buffer.from(
      '<svg width="1200" height="800"><rect width="1200" height="800" fill="#e8efe5"/><path d="M0 400Q400 700 1200 100" stroke="#cbddf0" stroke-width="140" fill="none"/><path d="M200 200L480 420 850 300" fill="none" stroke="#292823" stroke-width="3" stroke-dasharray="10 10"/><g fill="#d9938a" stroke="#292823" stroke-width="3"><circle cx="200" cy="200" r="22"/><circle cx="480" cy="420" r="22"/><circle cx="850" cy="300" r="22"/></g><text x="45" y="65" font-family="sans-serif" font-size="30">TEST BASEMAP · Layout fixture, not geographic data</text><g font-family="sans-serif" font-size="20" text-anchor="middle"><text x="200" y="207">1</text><text x="480" y="427">2</text><text x="850" y="307">3</text></g><text x="45" y="765" font-family="sans-serif" font-size="18">Test attribution placeholder</text></svg>',
    ),
  )
    .png()
    .toBuffer();
  const mocked = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, options) => {
      expect(String(input)).toContain("maps.geoapify.com/v1/staticmap");
      expect(options?.method).toBe("POST");
      const body = JSON.parse(options!.body as string);
      expect(body.markers.length).toBeGreaterThan(0);
      const flight = state.items.find((i) => i.flight)!.flight!;
      for (const airport of [
        flight.segments[0]!.departure.airport!,
        ...flight.segments.map((s) => s.arrival.airport!),
      ])
        expect(
          body.markers.some(
            (m: any) => m.lat === airport.lat && m.lon === airport.lon,
          ),
        ).toBe(true);
      return new Response(fixture, {
        headers: { "Content-Type": "image/png" },
      });
    });
  try {
    await mkdir("artifacts/exports", { recursive: true });
    for (const format of ["png", "pdf"]) {
      const job = await db.job.create({
        data: {
          tripId: trip.id,
          type: "export",
          input: {
            format,
            day: state.startDate,
            showBudget: true,
            showAccommodation: true,
          },
        },
      });
      await Promise.all([processExportJob(job.id), processExportJob(job.id)]);
      expect(await db.jobAttempt.count({ where: { jobId: job.id } })).toBe(1);
      const done = await db.job.findUniqueOrThrow({ where: { id: job.id } });
      expect(done.error).toBeNull();
      expect(done.status).toBe("completed");
      const output = done.output as any;
      keys.push(output.storageKey);
      const bytes = await getFile(output.storageKey);
      await writeFile(`artifacts/exports/layout-test.${format}`, bytes);
      if (format === "png") {
        const info = await sharp(bytes).metadata();
        expect(info.width).toBe(1200);
        expect(info.height).toBeGreaterThan(900);
      } else {
        expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(
          0,
        );
        Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const loading = getDocument({ data: new Uint8Array(bytes) });
        const pdf = await loading.promise;
        const extracted: string[] = [];
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          extracted.push(
            (await page.getTextContent()).items
              .map((i: any) => i.str ?? "")
              .join(" "),
          );
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height),
          );
          await page.render({
            canvas: canvas as any,
            canvasContext: canvas.getContext("2d") as any,
            viewport,
          }).promise;
          await writeFile(
            `artifacts/exports/pdf-page-${n}.png`,
            canvas.toBuffer("image/png"),
          );
        }
        expect(extracted.join(" ")).toContain("Layover: FRA");
        expect(extracted.join(" ")).toContain("LH1423");
        expect(extracted.join(" ")).toContain("Europe/Lisbon");
        await loading.destroy();
      }
    }
    expect(mocked).toHaveBeenCalledTimes(2);
  } finally {
    mocked.mockRestore();
    for (const key of keys) await deleteFile(key);
    await db.trip.delete({ where: { id: trip.id } });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
    delete process.env.GEOAPIFY_API_KEY;
  }
});
