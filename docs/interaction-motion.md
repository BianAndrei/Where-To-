# Interaction motion

The interaction direction comes from [Bencho](https://bencho.dev/): responsive selections, tactile controls and continuity between states. No Bencho code or assets were copied. Existing third-party component attribution is in `design-sources.md`.

The refinement pass uses the online [animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md) and [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md) skills, installed from Emil Kowalski's repository for Codex. Their recipes informed the timing, interruptibility, transform ownership and focus handling. Local `design-motion-principles` remains the reference for balancing playful marketing interactions with frequently used planner controls.

## Transitions

- `MotionPanel` keeps the owning component's state outside the changing surface. Text exits over 100 ms before the next panel enters over 200 ms, avoiding two readable pages superimposed on one another. Forward and backward day, editor, onboarding and marketing tabs use their actual order. Rapid input resolves to the latest selected panel; it does not build a queue of entrances.
- Editor tabs, translated menu descriptions and the postcard preview measure their content and resize locally over 280 ms. These expanding surfaces and native disclosures are the intentional height-animation exceptions: they move adjacent controls without stretching text. Full-page onboarding, long pages and the itinerary keep natural document height.
- The route wrapper freezes the outgoing `Routes` location. Admin navigation retains its shell and animates its main content. Pointer approach, touch and keyboard focus preload local route modules. Completed panel transitions remove their transforms so fixed navigation retains its viewport positioning.
- Switching travel days retains the adjacent map. The mobile map/plan switch uses [native view transitions](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) to animate snapshots while retaining the live map and plan. Browsers without this API switch immediately. Repeated switches skip the previous snapshot transition.
- Dialogs use centered, compositor-friendly transform strings with a 280 ms entrance and 180 ms exit. The backdrop fades with the surface. Radix still owns focus containment, Escape and scroll locking; departing dialogs are inert. A quick-add handoff preserves the draft and does not steal focus from the incoming editor.
- The postcard preview has both opening and closing motion. Focus is restored when the incoming DOM actually mounts, after its predecessor exits.

## Controls and feedback

- Selection surfaces use a 500 ms spring with 0.15 bounce. Reflow uses a 450 ms spring with zero bounce. Large content does not use an oscillating spring.
- CSS controls own their press and hover feedback; layout and gesture components own their transforms. Global button transform transitions were removed to avoid competing with Motion. Touch does not activate desktop hover movement.
- Counters roll only changing digits. Currency labels stay still. Screen readers receive the complete final formatted value once.
- Disclosures retarget from their current rendered height and opacity, including on reversal. Their native keyboard behavior is preserved, and animation handles and inline styles are cleaned up.
- Dropdowns enter from the trigger origin in 200 ms and leave in 140 ms. Checklist completion, saved-state feedback, item reordering and card removal share the same easing family. Saving uses a spinner, then a checkmark.
- In the booking example, confirming the reservation replaces its placeholder; arranging a transfer draws the completed route. Marketing illustration, magnetic and tilt effects remain bounded and respect their existing pause controls.
- Keyboard actions and reduced-motion interactions commit immediately. Selection and status information remain visible.

## Voice

Whereto supports weekends away, extended trips and routes across multiple destinations. Do not describe the product or the user's plans as “little trips,” “little adventures” or “little plans.” Use “your trip,” “your journey,” “your plans” or a specific description. Examples may have a specific duration without implying that all trips are short.

Only exact, previously shipped demo labels are refreshed in saved local demos. Personal edits and real trip records are preserved.

## Verification

Run `npm run build -w @whereto/web` and `npx playwright test` with the web server running. Desktop Chromium and mobile WebKit coverage includes:

- Dashboard archive, restore, filtering and card reflow.
- Rapid day and view switching, map retention and the mobile map switch.
- A 40-day onboarding draft retained while moving forward and backward.
- Editor draft preservation, dialog handoff, Escape and focus restoration.
- Preview opening, closing and reopening; menu language and repeated counter changes.
- Lazy route navigation and browser back.
- Keyboard and reduced motion, checklist persistence, drag ordering, costs and linked deposits.

No new application runtime dependency was added.

