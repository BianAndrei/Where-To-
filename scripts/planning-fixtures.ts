import { createRequire } from "node:module";
const require = createRequire(
  new URL("../apps/api/package.json", import.meta.url),
);
const { createCanvas } = require("@napi-rs/canvas");
const { PDFDocument, StandardFonts } = require("pdf-lib");
import { mkdir, writeFile } from "node:fs/promises";
const folder = "artifacts/planning";
await mkdir(folder, { recursive: true });
const canvas = createCanvas(900, 850),
  ctx = canvas.getContext("2d");
ctx.fillStyle = "white";
ctx.fillRect(0, 0, 900, 850);
ctx.fillStyle = "#222";
ctx.font = "34px Arial";
const lines = [
  "SAMPLE RECEIPT",
  "Lisbon Cafe",
  "",
  "Pasta                   14.00",
  "Salad                   10.00",
  "Drinks                   8.00",
  "",
  "TOTAL EUR               32.00",
  "",
  "Illustrative test document",
];
lines.forEach((line, i) => ctx.fillText(line, 60, 70 + i * 66));
await writeFile(folder + "/receipt.png", canvas.toBuffer("image/png"));
const pdf = await PDFDocument.create(),
  page = pdf.addPage([595, 842]),
  font = await pdf.embedFont(StandardFonts.Helvetica);
[
  "SAMPLE HOTEL CONFIRMATION",
  "Hotel: Riverside test stay",
  "Check-in: 2026-10-12 15:00",
  "Check-out: 2026-10-15",
  "Booking reference: TEST-PDF-123",
  "Total: EUR 420.00",
  "Address: Lisbon, Portugal",
].forEach((text, i) =>
  page.drawText(text, { x: 45, y: 770 - i * 32, size: 16, font }),
);
await writeFile(folder + "/confirmation.pdf", await pdf.save());
const scanned = await PDFDocument.create(),
  scanPage = scanned.addPage([450, 425]);
scanPage.drawImage(await scanned.embedPng(canvas.toBuffer("image/png")), {
  x: 0,
  y: 0,
  width: 450,
  height: 425,
});
await writeFile(folder + "/receipt-scan.pdf", await scanned.save());
console.log(
  "Created local sample receipt, text confirmation and scanned receipt fixtures.",
);
