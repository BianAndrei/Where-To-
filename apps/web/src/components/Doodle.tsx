import React from "react";
export type DoodleName =
  | "pin"
  | "map"
  | "wallet"
  | "suitcase"
  | "train"
  | "meal"
  | "sun"
  | "plane"
  | "spark";
const splat =
  "M43 12C52 2 70 18 78 22C94 17 100 37 91 51C104 68 85 85 73 84C63 105 40 92 34 83C17 91 2 71 13 55C-1 36 19 22 32 23Z";
export function Doodle({
  name = "pin",
  className = "",
  flow = false,
  colour = "#FFD69A",
}: {
  name?: DoodleName;
  className?: string;
  flow?: boolean;
  colour?: string;
}) {
  return (
    <svg
      className={`doodle doodle-${name} ${className} ${flow ? "doodle-flow" : ""}`}
      viewBox="0 0 110 110"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="paint-splat"
        d={splat}
        fill={colour}
        transform="translate(5 3)"
      />
      <g
        stroke="#292823"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ink-drawing"
      >
        {name === "pin" && (
          <>
            <ellipse
              className="pin-ground"
              cx="55"
              cy="87"
              rx="14"
              ry="4"
              stroke="none"
              fill="#292823"
              opacity=".12"
            />
            <g className="pin-drop">
              <path
                d="M55 17C40 17 29 28 29 42C29 59 44 75 55 85C66 75 81 59 81 42C81 28 70 17 55 17Z"
                fill="#E8ACA0"
              />
              <circle cx="55" cy="42" r="10" fill="#FFD69A" />
            </g>
          </>
        )}
        {name === "map" && (
          <>
            <path d="m17 35 24-10 28 13 22-11 1 49-23 12-28-13-23 10-1-50Z" />
            <path d="m41 25 1 23m0 14v13m27-37 1 49" />
            <path
              className="draw-route"
              d="M27 63c14-23 24 16 42-7"
              strokeDasharray="3 8"
            />
            <path
              d="M85 30c0-15-22-15-22 0 0 8 11 18 11 18S85 38 85 30Z"
              fill="#E8ACA0"
            />
          </>
        )}
        {name === "wallet" && (
          <>
            <g className="wallet-coin">
              <circle cx="56" cy="25" r="12" fill="#FFD69A" />
              <path
                d="M59 21C53 17 48 25 53 29C55 31 57 30 59 29M50 24H56"
                strokeWidth="2.5"
              />
            </g>
            <path d="M23 40L74 30Q78 29 79 33L81 42" fill="#CDE5D4" />
            <path
              d="M27 40H82Q91 40 91 49V79Q91 88 82 88H27Q18 88 18 79V47Q18 40 27 40Z"
              fill="#FFD69A"
            />
            <path d="M19 50H89" />
            <path d="M91 60H76C65 60 65 77 76 77H91Z" fill="#E8ACA0" />
            <circle cx="76" cy="68.5" r="2.5" fill="#292823" stroke="none" />
            <path d="M29 77H40" strokeWidth="3" />
          </>
        )}
        {name === "suitcase" && (
          <>
            <path d="M41 33V28C41 12 69 12 69 28V33" />
            <path
              d="M30 33H80C89 33 94 38 94 47V72C94 81 89 86 80 86H30C21 86 16 81 16 72V47C16 38 21 33 30 33Z"
              fill="#E8ACA0"
            />
            <path d="M32 33V86M78 33V86M33 86V91M77 86V91" />
            <g className="suitcase-stamp">
              <circle cx="55" cy="59" r="8" fill="#FFD69A" strokeWidth="3.3" />
              <path
                d="M55 44V41M55 77V74M40 59H37M73 59H70M44 48L42 46M66 70L68 72M44 70L42 72M66 48L68 46"
                strokeWidth="2.6"
              />
            </g>
          </>
        )}
        {name === "train" && (
          <>
            <path
              d="M39 77L27 93M71 77L83 93M34 85H76M29 92H81"
              strokeWidth="3.6"
            />
            <g className="train-cabin">
              <path
                d="M40 18H70Q84 18 84 32V65Q84 78 71 78H39Q26 78 26 65V32Q26 18 40 18Z"
                fill="#CDE5D4"
              />
              <path d="M34 33H76V51H34Z" fill="#CBDDF0" strokeWidth="3.4" />
              <path d="M55 33V51M45 25H65" strokeWidth="3.4" />
              <circle cx="38" cy="64" r="4" fill="#FFD69A" strokeWidth="3" />
              <circle cx="72" cy="64" r="4" fill="#FFD69A" strokeWidth="3" />
              <path d="M48 69H62" strokeWidth="3" />
            </g>
          </>
        )}
        {name === "meal" && (
          <>
            <g className="meal-steam" strokeWidth="3.5">
              <path className="steam-one" d="M37 38C28 30 44 27 36 18" />
              <path className="steam-two" d="M54 35C45 27 61 24 53 15" />
              <path className="steam-three" d="M71 38C62 30 78 27 70 18" />
            </g>
            <path d="M72 57L88 31" />
            <path
              d="M19 53H91C88 74 76 86 55 86C34 86 22 74 19 53Z"
              fill="#CDE5D4"
            />
            <path d="M22 61H88" strokeWidth="3.3" />
            <path d="M43 86H67V91H43Z" fill="#E8ACA0" strokeWidth="3.5" />
            <path d="M35 68C37 73 41 76 45 77" strokeWidth="3" />
          </>
        )}
        {name === "sun" && (
          <>
            <g className="sun-rays" strokeWidth="4">
              <path d="M55 17V24M55 86V93M17 55H24M86 55H93M28 28L33 33M77 77L82 82M28 82L33 77M77 33L82 28" />
            </g>
            <circle cx="55" cy="55" r="22" fill="#FFD69A" />
            <g className="sun-face" strokeWidth="3">
              <path d="M47 51V53M63 51V53M48 62Q55 68 62 62" />
            </g>
          </>
        )}
        {name === "plane" && (
          <g className="paper-flight">
            <path
              className="plane-trail"
              d="M36 75C29 85 12 95 10 85C8 75 28 83 23 94C20 101 10 102 5 98"
              strokeWidth="2.5"
              strokeDasharray="3 6"
            />
            <g className="paper-plane">
              <path d="M19 42L91 21L71 83L51 61L36 75L38 52Z" fill="#CBDDF0" />
              <path d="M38 52L91 21L51 61L36 75L38 52Z" fill="#CDE5D4" />
              <path d="M51 61L71 83L91 21" />
            </g>
          </g>
        )}
        {name === "spark" && (
          <>
            <path
              className="spark-main"
              d="M51 23C55 44 61 50 81 54C61 58 55 64 51 85C47 64 41 58 21 54C41 50 47 44 51 23Z"
              fill="#FFD69A"
            />
            <path
              className="spark-small"
              d="M84 14C86 23 88 25 97 27C88 29 86 31 84 40C82 31 80 29 71 27C80 25 82 23 84 14Z"
              fill="#E8ACA0"
              strokeWidth="3.1"
            />
          </>
        )}
      </g>
    </svg>
  );
}
export { Logo } from "./BrandLogo";
export { TravelDrawing } from "./TravelDrawing";
