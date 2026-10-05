# Whereto visual revision — September 2026

The September 11 interaction pass is documented in [interaction-motion.md](interaction-motion.md). Its reference is [Bencho](https://bencho.dev/), used for interaction direction; no source or assets were copied from that site.

The approved `public/brand/travel-pastel.png` remains the reference for the hero, now redrawn as editable vector paths in `TravelDrawing.tsx` at the user's request. The original map icon paths in `Doodle.tsx` are preserved. The other eight icons have been redrawn as connected silhouettes, with pastel interior fills and individual SVG part animations. The web UI and downloadable SVGs share the same geometry and animation stylesheet.

## Components actually integrated from the supplied ZIPs

| Supplied source | Adaptation | Where it runs |
| --- | --- | --- |
| `code (6).zip/files/script.js`, Purity of Noise menu | `apps/web/src/components/archive/WaveMenu.tsx` | The **Menu** button on every marketing page. One baked SVG wave translated by GSAP, followed by masked/staggered links. Radix adds focus containment, Escape, scroll locking and restoration. |
| `code (7).zip/FullscreenClipEffect-main/js/index.js` | `apps/web/src/components/archive/ClipPostcards.tsx` | **Open the trip** in the Lisbon postcard. The inset clip expands and the content settles into the interactive planner preview. |
| `code (8).zip/next-text-reveal-animation/src/components/AnimatedHeader/AnimatedHeader.jsx` | `apps/web/src/components/archive/AnimatedHeader.tsx` | Hero and feature headings. GSAP SplitText, character x/skew reveal and per-line timing, with shorter travel and one-shot observation. |

`code (9).zip` was inspected; its video/smoke assets and blocking simulated-progress preloader are not included. No global installation commands from attachments were executed.

## React Bits components actually integrated

Adapted from [David Haz / React Bits](https://github.com/DavidHDev/react-bits), TypeScript + CSS variants, retrieved 8 September 2026. The [upstream license](third-party/react-bits-LICENSE.md) is preserved.

- [Magnet](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Animations/Magnet/Magnet.tsx) → `components/react-bits/Magnet.tsx`: the hero CTA; original pointer-distance calculation, bounded to 8px and disabled for touch, reduced motion and keyboard focus.
- [TiltedCard](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Components/TiltedCard/TiltedCard.tsx) → `components/react-bits/TiltedCard.tsx`: hero artwork and budget receipt; normalized pointer rotation and Motion springs, limited to 5 degrees on desktop. Adapted to accept our own illustrated children.
- [CountUp](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/TextAnimations/CountUp/CountUp.tsx) → `components/react-bits/CountUp.tsx`: actual example-budget changes, using the original Motion value/spring/subscription mechanism. Reads from the previous amount, announces only the final amount, and changes instantly for keyboard or reduced motion.

## Illustration system

`Doodle.tsx` is the single source for the nine drawings. `doodle-motion.css` animates internal SVG groups: pin landing, coin deposit, luggage stamp, train cabin, steam, sun rays/face, paper plane and stars. It also handles gently moving paint shapes. The homepage has a pause control, and every animation respects `prefers-reduced-motion`.

Run `npm run brand:build` to regenerate static SVGs, standalone animated SVGs, transparent PNG logo, PWA icon, favicon, monochrome mark and wordmark. Downloadable SVGs embed their CSS; they do not depend on React or JavaScript to animate.

The hero uses the same `TravelIllustration` paths as `travel-illustration.svg` and `travel-illustration-animated.svg`; none embeds a bitmap. The original composition, pastel regions and broad connected outlines are retained. A 9.6-second sequence gives the pin a small lift and landing, followed by a luggage sway and a turn of the sun rays. The route stays still. Two slowly drifting paint shapes keep the background gentle. `travel-motion.css` replaces the old whole-image drift, responds to Pause illustrations and reduced motion, and pauses the homepage illustration outside the viewport. Handles and seams stay attached because they move inside the luggage group.

The itinerary/budget application keeps its existing structure and data behavior; the shared logo and icon artwork update everywhere. No new runtime package was required for this revision.

## Supplied Whereto logo

The logo selected on 8 September is preserved unchanged as `public/brand/whereto-original.png`. `BrandLogo.tsx` uses SVG viewports and a paper-removal display filter to arrange the actual symbol and lettering horizontally in navigation and vertically in the footer. The supplied handwritten lettering is not replaced with a font. Downloadable logo SVGs embed this raster artwork; they are SVG containers, not newly traced vector paths. `brand:build` generates these assets separately from the nine illustrated icons, so rebuilding the icon set preserves the chosen identity.

Tab icons use small PNGs and a multi-size ICO generated from the selected symbol, with versioned URLs to refresh older cached favicons. The hero's “First trip is on us” note points at its CTA on desktop and mobile. The paper plane and its tail-attached trail share one animated group.

The wave menu starts in CSS-hidden poses before its lazy GSAP module loads. One scoped, reversible timeline controls both directions, and Radix stays modal until the closing sequence finishes. Opening moves the measured root scrollbar gap into the background page's margin: page width stays unchanged while the wave covers the entire viewport, including the former white strip. Short viewports scroll inside the menu; keyboard and reduced-motion interactions are immediate. Navigation waits for closing and suppresses trigger focus restoration so hash links keep their destination in view. Verified in the browser at desktop, narrow and short mobile sizes, including rapid closing, Escape, internal scrolling and anchor navigation.

## Form controls

The compact planner navigation adapts the user-supplied React Bits Pro App Sidebar 2 source in `components/react-bits/AppSidebar2.tsx`. It uses Phosphor icons and the existing warm palette, with Radix portalled flyouts for collision handling, keyboard focus and outside dismissal. Hover previews can be pinned with a click. The groups open real trip tools; navigation density is stored on the device. On mobile, compact mode hides navigation labels and secondary planning actions share the Trip tools disclosure. The former Brand page and its links have been removed; original branding assets remain in use by the logo and PWA.

`components/Select.tsx` uses [Radix Select](https://www.radix-ui.com/primitives/docs/components/select) with a shared cream popup, apricot focus highlight, mint selection check and a short reduced-motion-aware reveal. Every visible native select in onboarding and the planner now uses this component. `Field` links its label and hint to the trigger. Empty values such as “The whole trip” round-trip through the component without becoming placeholders. Native checkboxes retain their input semantics with custom rounded borders, mint fills and a crisp check; forced-colors mode restores the system checkbox. Global text selection is apricot with dark ink. Browser checks covered keyboard selection, checklist toggling, editor categories and cost units, whole-trip export selection and popup bounds at 390px.
