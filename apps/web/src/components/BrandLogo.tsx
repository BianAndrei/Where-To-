import React, { useId } from "react";
import { publicAsset } from "../lib/deployment";

export type BrandPart = "mark" | "name" | "stacked";
const viewBoxes: Record<BrandPart, string> = {
  mark: "300 270 656 520",
  name: "253 775 750 190",
  stacked: "250 270 755 700",
};

/** The user's actual artwork, including its lettering. SVG viewports arrange the
 * original pixels without substituting a font or redrawing the mark. The display
 * filter removes the paper background so the logo sits on any pastel surface. */
export function BrandGraphic({
  part,
  source = publicAsset("brand/whereto-original.png"),
  monochrome = false,
}: {
  part: BrandPart;
  source?: string;
  monochrome?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const filter = `brand-paper-${id}`;
  const clip = `brand-crop-${id}`;
  const inkOnly = part === "name" || monochrome;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`brand-graphic brand-graphic--${part}`}
      viewBox={viewBoxes[part]}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <filter
          id={filter}
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feColorMatrix
            type="matrix"
            values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  ${inkOnly ? "-3 -3 -3 0 4.5" : "-4 -4 -4 0 11.55"}`}
          />
        </filter>
        <clipPath id={clip}>
          {/* Preserve the bottom of the paint without picking up the h ascender. */}
          <path d="M300 270H956V790H460V774H300Z" />
        </clipPath>
      </defs>
      <g clipPath={part === "mark" ? `url(#${clip})` : undefined}>
        <image
          href={source}
          width="1254"
          height="1254"
          filter={`url(#${filter})`}
        />
      </g>
    </svg>
  );
}

export function Logo({
  small = false,
  layout = "horizontal",
}: {
  small?: boolean;
  layout?: "horizontal" | "stacked";
}) {
  return (
    <span
      className={`brand brand-artwork brand-artwork--${layout} ${small ? "small" : ""}`}
      role="img"
      aria-label="Whereto"
    >
      {layout === "stacked" ? (
        <BrandGraphic part="stacked" />
      ) : (
        <>
          <BrandGraphic part="mark" />
          <BrandGraphic part="name" />
        </>
      )}
    </span>
  );
}
