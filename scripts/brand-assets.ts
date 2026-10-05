import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { Doodle, type DoodleName } from "../apps/web/src/components/Doodle.js";
import { TravelIllustration } from "../apps/web/src/components/TravelDrawing.js";
import {
  BrandGraphic,
  type BrandPart,
} from "../apps/web/src/components/BrandLogo.js";
const root = new URL("../apps/web/public/brand/", import.meta.url);
await mkdir(root, { recursive: true });
const names: DoodleName[] = [
  "pin",
  "map",
  "wallet",
  "suitcase",
  "train",
  "meal",
  "sun",
  "plane",
  "spark",
];
const colours = ["#FFD69A", "#CDE5D4", "#CBDDF0", "#D9938A"];
const motion = `<style>${await readFile(new URL("../apps/web/src/components/doodle-motion.css", import.meta.url), "utf8")}</style>`;
for (const [i, name] of names.entries()) {
  const raw = renderToStaticMarkup(
    createElement(Doodle, { name, colour: colours[i % 4] }),
  ).replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  await writeFile(new URL(`${name}.svg`, root), raw);
  await writeFile(
    new URL(`${name}-animated.svg`, root),
    raw
      .replace(`doodle doodle-${name}`, `doodle doodle-${name} doodle-flow`)
      .replace("</svg>", motion + "</svg>"),
  );
}
const travelMotion = await readFile(
  new URL("../apps/web/src/components/travel-motion.css", import.meta.url),
  "utf8",
);
await writeFile(
  new URL("travel-illustration.svg", root),
  renderToStaticMarkup(createElement(TravelIllustration, { animated: false })),
);
await writeFile(
  new URL("travel-illustration-animated.svg", root),
  renderToStaticMarkup(createElement(TravelIllustration)).replace(
    "</svg>",
    `<style>${travelMotion}</style></svg>`,
  ),
);

// Embed the original supplied artwork so downloaded SVGs are self-contained.
const artwork = await readFile(new URL("whereto-original.png", root));
const source = `data:image/png;base64,${artwork.toString("base64")}`;
function brand(part: BrandPart, monochrome = false) {
  return renderToStaticMarkup(
    createElement(BrandGraphic, { part, source, monochrome }),
  );
}
const logo = brand("stacked");
const icon = brand("mark");
const socialArt = renderToStaticMarkup(
  createElement(TravelIllustration, { animated: false }),
).replace("<svg ", '<svg x="588" y="72" width="596" height="466" ');
const socialName = brand("name").replace(
  "<svg ",
  '<svg x="62" y="55" width="190" height="49" ',
);
const social = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#FFFDF8"/>
<path d="M0 567Q320 519 649 571T1200 556V630H0Z" fill="#FAE5C5"/>
${socialName}${socialArt}
<g fill="#292823" font-family="Nunito, Segoe UI, sans-serif">
<text x="62" y="237" font-size="65" font-weight="800" letter-spacing="-3">A lovely trip.</text>
<text x="62" y="313" font-size="65" font-weight="800" letter-spacing="-3">A clear budget.</text>
<text x="65" y="377" font-size="23">Your days, places and money. Together.</text>
<rect x="62" y="420" width="310" height="59" rx="29.5" fill="#292823"/>
<text x="217" y="458" fill="#FFFDF8" text-anchor="middle" font-size="22" font-weight="700">Your first trip is free</text>
<text x="65" y="518" font-size="18" fill="#696453">No card required. Just somewhere to go.</text>
</g></svg>`;
await writeFile(new URL("social-preview.svg", root), social);
await sharp(Buffer.from(social))
  .png()
  .toFile(fileURLToPath(new URL("social-preview.png", root)));
await writeFile(new URL("logo.svg", root), logo);
await writeFile(new URL("icon.svg", root), icon);
await writeFile(new URL("../favicon.svg", root), icon);
await writeFile(new URL("wordmark.svg", root), brand("name"));
await writeFile(new URL("icon-mono.svg", root), brand("mark", true));
await sharp(Buffer.from(logo))
  .resize({ width: 640 })
  .png()
  .toFile(fileURLToPath(new URL("logo.png", root)));
await sharp(Buffer.from(icon))
  .resize(192, 192, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(fileURLToPath(new URL("icon-192.png", root)));
// Browsers can restrict embedded images in SVG favicons. Rasterize the selected
// symbol at tab-icon sizes and give older browsers a multi-size ICO fallback.
const faviconSizes = [16, 32, 48, 64];
const favicons: Buffer[] = [];
for (const size of faviconSizes) {
  const png = await sharp(Buffer.from(icon))
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  await writeFile(new URL(`favicon-${size}.png`, root), png);
  favicons.push(png);
}
const icoHeader = Buffer.alloc(6 + favicons.length * 16);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(favicons.length, 4);
let imageOffset = icoHeader.length;
favicons.forEach((png, i) => {
  const entry = 6 + i * 16;
  icoHeader[entry] = faviconSizes[i];
  icoHeader[entry + 1] = faviconSizes[i];
  icoHeader.writeUInt16LE(1, entry + 4);
  icoHeader.writeUInt16LE(32, entry + 6);
  icoHeader.writeUInt32LE(png.length, entry + 8);
  icoHeader.writeUInt32LE(imageOffset, entry + 12);
  imageOffset += png.length;
});
await writeFile(
  new URL("../favicon.ico", root),
  Buffer.concat([icoHeader, ...favicons]),
);
console.log(
  "Created nine custom icons, the vector travel illustration, animated SVG variants and Whereto logo assets.",
);
