# Product polish — requirement and evidence ledger

Scope: all six landing requirements and all eight application requirements in the active user goal. A passing fixture test is not proof of a live provider integration.

| Requirement                       | Current evidence / next verification                                                                                                                                | State                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| L1. Discoverable interactive demo | Shared itinerary/map/budget example exists; cover CTA and reveal need improvement and browser verification.                                                         | In progress                                   |
| L2. Concrete benefits             | Review itinerary, budget and menu copy against actual behavior.                                                                                                     | Pending                                       |
| L3. Mobile polish                 | Previous individual fixes exist; recheck complete landing at 390 px and short viewport.                                                                             | Pending                                       |
| L4. Coordinated motion            | FAQ, hero and menu already animated; clip reveal can flash during lazy loading. Check reduced motion, resting beats, mobile cost.                                   | In progress                                   |
| L5. Commercial clarity            | Prices and locks appear on landing/onboarding; verify full signup decision path.                                                                                    | Pending                                       |
| L6. Search/share/accessibility    | Basic title/description only; social image and route metadata missing.                                                                                              | Pending                                       |
| A1. First real trip end to end    | Local auth/API tests pass; disposable account UI flow through export still needs completion.                                                                        | Pending                                       |
| A2. Useful empty trips            | Add stay/transport/day entry points needed.                                                                                                                         | In progress                                   |
| A3. Quick adding                  | Current quick expense opens full editor; implement a short form with optional detail and linked payments.                                                           | In progress                                   |
| A4. Clear budget                  | Domain deposit/refund tests pass; UI confuses booking and cost confirmation. Add separate summaries.                                                                | In progress                                   |
| A5. Live integrations             | Missing provider keys at last configuration check. Validate missing-key paths locally; live places/routes/transit/menu checks require configured accounts.          | Pending external configuration + local checks |
| A6. Today                         | Current stop selection can prefer untimed items and lacks direct booking, clock updates, and pretrip context.                                                       | Pending                                       |
| A7. Collaboration/recovery        | API tests cover private access, optimistic version rejection, sanitized viewer sharing/revocation. Editor invites, recovery and browser draft conflicts need tests. | Partial evidence                              |
| A8. Business rules                | API tests cover concurrent first trip, archive and locks; domain date and billing fixtures pass. Inspect full cancellation/date/permission paths.                   | Partial evidence                              |

## Baseline, 2026-09-08

`npm test`: 31 tests passed across API, domain, rounding, menus, billing and exports. Menu/provider and export tests use explicit fixtures; no live provider validation is implied. No production messages or payments sent.

## External verification

Keep credentials in local environment files. Never put secret values here. Provider keys were not configured at the last inspection. Production domain and live/test provider access remain unverified; do not mark the full objective complete on the basis of local fixtures.

## Implemented and checked, 2026-09-08 follow-up

- L1/L2: postcard cover now explicitly invites an interactive demo, describes the shared change, and has a clear “Open the demo” action. Feature copy explains booking links, schedule clashes, estimates, deposits and splitting. In-browser example verified at 1280 px and 390 px: adding sailing produces three map points and €116. Keyboard focus returns to the cover after closing.
- L3: demo mobile text was increased from 8–10 px to 11–14 px for readable details, times and actions; verified visually at 390 px without horizontal overflow. Full landing/accessibility sweep remains pending.
- L4: lazy GSAP clip reveal now starts from a CSS-defined pose, preloads on intent, settles in 550 ms, respects keyboard/reduced motion and recovers if the import fails. Overall animation/performance audit remains pending.
- L6: route titles/descriptions, Open Graph/Twitter metadata, a 1200×630 pastel social preview, static HTML metadata for public pages, private-route noindex, robots rules and a conditional sitemap. Social PNG inspected visually. Full root build passed. Configure `VITE_PUBLIC_SITE_URL` before deployment for absolute crawler preview/canonical/sitemap URLs; no public origin has been invented. Host must serve the generated public route index files before the SPA fallback.
- A2/A3: new-trip stay/transport/day shortcuts; short activity/expense form; optional advanced editor; linked payment option. New durations default to unknown (0), rather than assuming an hour. Browser verified a €30 activity and a €10 linked payment: one item, total unchanged, outstanding reduced by €10. Temporary demo item moved to recovery after the check. Empty-account UI flow remains pending.
- A4: deterministic estimated/confirmed/payment/refund subtotals and honest booking labels. An overpayment on one item no longer masks the outstanding amount on another; it is shown separately. Domain regression covers the case.
- A6: ongoing/next/flexible stops, local clocks per stop, overnight durations, pretrip/finished context, current stay, direct booking/navigation, documents and quick expense. Clock refreshes every 30 s while Today is open. Five domain cases pass; pretrip screen inspected in browser. Full phone and in-trip acceptance remain pending.
- `npm test`: 37 tests passed. `npm run typecheck` passed. `npm run build` passed (pre-existing large MapLibre chunk warning remains). Browser regression specification extended; this turn's actual browser verification used CUA, not the separate Playwright test runner.

Next: complete disposable-account UI flow through export; protect editor drafts during collaboration conflicts; add API coverage for invitations/restores/cancellation/date bypass; verify unconfigured providers and then live providers when configured. Complete the mobile, keyboard, reduced-motion and generated metadata checks after the latest edits before final goal audit.

Final checks for this tranche: rebuilt frontend after the last mobile/readability edits; domain/Today/rounding retest passed (29 tests). Generated homepage/pricing/app/404 HTML each contains exactly one correct title, social image metadata, and index/noindex as intended. Browser error/warning log is empty. Temporary viewport override reset. Geoapify, Groq, Google Places/Routes, Stripe and the public site origin remain unconfigured (checked as booleans only).
