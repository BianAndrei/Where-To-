import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import {
  tripDays,
  orderedItems,
  publicTrip,
  itemTotal,
  money,
  mapItems,
  flightSummaryLines,
  type TripState,
} from "@whereto/shared";
import { db, assert, HttpError } from "./db.js";
import { claimJob, finishAttempt } from "./job-runtime.js";
import { reserveProvider, dayPeriod } from "./providers.js";
import { putFile } from "./storage.js";
const require = createRequire(import.meta.url);
async function mapImage(state: TripState, day?: string) {
  assert(
    process.env.GEOAPIFY_API_KEY,
    503,
    "Connect Geoapify to export a real map. Your plan remains saved and can be printed from the itinerary.",
  );
  const scheduled = day
    ? orderedItems(state, day)
    : state.items
        .filter((i) => !i.deletedAt && i.state !== "idea")
        .sort(
          (a, b) =>
            (a.day ?? "").localeCompare(b.day ?? "") || a.order - b.order,
        );
  const items = mapItems(scheduled);
  const points = items.length
    ? items.map((i) => i.location!)
    : state.destinations;
  const minLon = Math.min(...points.map((p) => p.lon)),
    maxLon = Math.max(...points.map((p) => p.lon)),
    minLat = Math.min(...points.map((p) => p.lat)),
    maxLat = Math.max(...points.map((p) => p.lat));
  const padX = Math.max((maxLon - minLon) * 0.12, 0.007),
    padY = Math.max((maxLat - minLat) * 0.12, 0.007);
  await reserveProvider(
    "geoapify",
    12 + points.length,
    dayPeriod(),
    Number(process.env.GEOAPIFY_DAILY_CREDITS || 2500),
  );
  const url = new URL("https://maps.geoapify.com/v1/staticmap");
  url.searchParams.set("apiKey", process.env.GEOAPIFY_API_KEY!);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(25000),
    body: JSON.stringify({
      style: "positron",
      width: 1200,
      height: 800,
      area: {
        type: "rect",
        value: {
          lon1: Math.max(-180, minLon - padX),
          lat1: Math.max(-85, minLat - padY),
          lon2: Math.min(180, maxLon + padX),
          lat2: Math.min(85, maxLat + padY),
        },
      },
      markers: points.map((p, i) => ({
        lon: p.lon,
        lat: p.lat,
        type: "circle",
        color: "#D9938A",
        size: "medium",
        text: String(i + 1),
        textsize: 14,
      })),
      geometries:
        points.length > 1
          ? [
              {
                type: "polyline",
                value: points.map((p) => ({ lon: p.lon, lat: p.lat })),
                linecolor: "#292823",
                linewidth: 2,
                linestyle: "dashed",
              },
            ]
          : [],
    }),
  });
  assert(
    response.ok,
    503,
    "Map export is temporarily unavailable. No document was generated.",
  );
  return {
    image: Buffer.from(await response.arrayBuffer()),
    items,
    unmapped: scheduled.filter((i) => !i.location),
  };
}
export async function processExportJob(id: string) {
  const job = await claimJob(id);
  if (!job) return;
  try {
    const options = job.input as any;
    let state = job.trip.state as unknown as TripState;
    state = publicTrip(state, options.showBudget, options.showAccommodation);
    const date = new Date().toISOString().slice(0, 10);
    const main = await mapImage(state, options.day);
    let data: Buffer;
    let mime: string;
    if (options.format === "png") {
      GlobalFonts.registerFromPath(
        require.resolve("@fontsource/nunito/files/nunito-latin-400-normal.woff"),
        "Nunito",
      );
      const measure = createCanvas(1200, 100).getContext("2d");
      const wrap = (text: string, size: number) => {
        measure.font = `${size}px Nunito`;
        const result: string[] = [];
        let line = "";
        for (const word of text.split(" ")) {
          const next = line ? line + " " + word : word;
          if (line && measure.measureText(next).width > 1120) {
            result.push(line);
            line = word;
          } else line = next;
        }
        if (line) result.push(line);
        return result;
      };
      const title = wrap(
        state.title + (options.day ? " / " + options.day : ""),
        30,
      );
      const legend = main.items.flatMap((item, n) =>
        wrap(
          `${n + 1}. ${options.day ? "" : (item.day ?? "")} ${item.time ?? "Time to be confirmed"} · ${item.title}${options.showBudget ? " · " + (item.lines.length ? money(itemTotal(item), state.currency) : item.kind === "flight" && item.id !== item.parentId ? "Fare included in booking" : "Cost not estimated") : ""}`,
          19,
        ),
      );
      const flightDetails = main.items.flatMap((item) =>
        item.flight
            ? flightSummaryLines(item.flight).flatMap((text) => wrap(text, 19))
          : [],
      );
      legend.push(...flightDetails);
      const unlocated = main.unmapped.flatMap((item) =>
        wrap("No pin · " + item.title, 19),
      );
      const mapTop = 60 + title.length * 36,
        legendTop = mapTop + 830,
        height = legendTop + (legend.length + unlocated.length) * 30 + 70;
      const canvas = createCanvas(1200, height),
        ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fffdf8";
      ctx.fillRect(0, 0, 1200, height);
      ctx.fillStyle = "#292823";
      ctx.font = "30px Nunito";
      title.forEach((text, i) => ctx.fillText(text, 35, 40 + i * 36));
      ctx.font = "16px Nunito";
      ctx.fillText(
        "Whereto · Generated " +
          date +
          " · Lines show stop order, not navigation",
        35,
        mapTop - 18,
      );
      ctx.drawImage(await loadImage(main.image), 0, mapTop, 1200, 800);
      ctx.fillStyle = "#292823";
      ctx.font = "19px Nunito";
      [...legend, ...unlocated].forEach((line, i) =>
        ctx.fillText(line, 35, legendTop + i * 30),
      );
      ctx.font = "15px Nunito";
      ctx.fillText(
        "© Geoapify · © OpenStreetMap contributors · © OpenMapTiles",
        35,
        height - 25,
      );
      data = canvas.toBuffer("image/png");
      mime = "image/png";
    } else {
      const pdf = await PDFDocument.create();
      pdf.registerFontkit(fontkit);
      const font = await pdf.embedFont(
        await readFile(
          require.resolve("@fontsource/nunito/files/nunito-latin-400-normal.woff"),
        ),
        { subset: true },
      );
      const bold = await pdf.embedFont(
        await readFile(
          require.resolve("@fontsource/nunito/files/nunito-latin-700-normal.woff"),
        ),
        { subset: true },
      );
      const days = options.day ? [options.day] : tripDays(state);
      const panels = options.day
        ? [{ day: options.day, ...main }]
        : [{ day: "Whole trip", ...main }];
      if (!options.day)
        for (const day of days)
          panels.push({ day, ...(await mapImage(state, day)) });
      for (const panel of panels) {
        let page = pdf.addPage([595, 842]);
        let y = 800;
        const line = (text: string, size = 11, emphasis = false) => {
          if (y < 45) {
            page = pdf.addPage([595, 842]);
            y = 800;
          }
          const activeFont = emphasis ? bold : font;
          const words = text.replace(/[\r\n]/g, " ").split(" ");
          const lines: string[] = [];
          let current = "";
          for (const word of words) {
            const candidate = current ? current + " " + word : word;
            if (
              activeFont.widthOfTextAtSize(candidate, size) > 525 &&
              current
            ) {
              lines.push(current);
              current = word;
            } else current = candidate;
          }
          if (current) lines.push(current);
          for (const wrapped of lines) {
            if (y < 45) {
              page = pdf.addPage([595, 842]);
              y = 800;
            }
            page.drawText(wrapped, {
              x: 32,
              y,
              size,
              font: emphasis ? bold : font,
              color: rgb(0.16, 0.16, 0.14),
            });
            y -= size + 10;
          }
        };
        line(state.title, 23, true);
        line(`${panel.day}  |  ${state.startDate} - ${state.endDate}`, 11);
        const png = await sharp(panel.image).png().toBuffer();
        const image = await pdf.embedPng(png);
        page.drawImage(image, { x: 32, y: y - 354, width: 531, height: 354 });
        y -= 380;
        line("Numbered stops", 14, true);
        panel.items.forEach((item, n) => {
          line(`${n + 1}. ${item.time ?? "Any time"}  ${item.title}`, 12, true);
          line(
            `${item.duration ? `${item.duration} min` : item.kind === "flight" ? "Airport stop" : "Duration not set"}${options.showBudget ? "  |  " + (item.lines.length ? money(itemTotal(item), state.currency) : item.kind === "flight" && item.id !== item.parentId ? "Fare included in booking" : "Cost not estimated") : ""}  |  ${item.location?.name ?? ""}`,
            10,
          );
          if (item.flight)
            flightSummaryLines(item.flight).forEach((text) => line(text, 10));
        });
        panel.unmapped.forEach((item) => line("No pin · " + item.title, 10));
        line(
          `Generated ${date} · Whereto · Stop order is not turn-by-turn navigation.`,
          9,
        );
        line("© Geoapify · © OpenStreetMap contributors · © OpenMapTiles", 9);
      }
      data = Buffer.from(await pdf.save());
      mime = "application/pdf";
    }
    const storageKey = `exports/${job.tripId}/${id}.${options.format}`;
    await putFile(storageKey, data, mime);
    await db.job.update({
      where: { id },
      data: {
        status: "completed",
        output: {
          storageKey,
          mime,
          filename: `whereto-${options.day ?? "whole-trip"}.${options.format}`,
        },
      },
    });
  } catch (error) {
    await db.job.update({
      where: { id },
      data: {
        status:
          error instanceof HttpError && error.code === "PROVIDER_PAUSED"
            ? "waiting"
            : "failed",
        errorCode: error instanceof HttpError ? error.code : "EXPORT_FAILED",
        error:
          error instanceof Error
            ? error.message
            : "Export failed. Please try again.",
      },
    });
  } finally {
    await finishAttempt(id, job.attemptId);
  }
}
