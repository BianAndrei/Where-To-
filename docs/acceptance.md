# Browser acceptance

Use localhost:5173. The demo contains illustrative prices and a diagram explicitly labelled as an illustrative map.

1. Landing: add sunset sailing in the interactive example. Timeline, map point count and the displayed day total must update together. Open the full demo.
2. Add an activity with one €30 cost line, quantity 4. Save; check one €120 item in Itinerary and Budget. Reopen it and edit the amount; there must not be a duplicate.
3. Open a stay, add a €150 payment against a €600 confirmed cost. Planned remains €600 and outstanding is €450. Delete/restore the item and check both views.
4. Reorder a day by dragging, then with the arrow buttons or keyboard drag control. Preview the suggested order; fixed reservations remain anchors. Undo restores the original order.
5. Open mobile navigation at 390 px, switch to Budget and use the essentials menu. Dialogs must fit the screen, accept keyboard input and close with Escape.
6. Enable reduced motion. Animated SVG assets and the landing must stop decorative motion. Keyboard focus remains visible.
7. Register a disposable account with local verification mail. Complete onboarding, reload, and verify the real trip remains. A second trip must show pricing before creation. Destinations have no edit control.
8. Create a viewer link with default settings. Open logged out; budget, accommodation, private notes, payments, names and documents are absent. Revoke and confirm it is unavailable. An editor must authenticate before joining.
9. With Geoapify configured: search and select a location, compare actual walking times, export day PDF/PNG and whole-trip PDF. Inspect numbered points, full legend, day/date and attribution.
10. With Groq configured: import a permitted text menu, a scan and a malformed file. Verify original names/prices/source/date, English translations, unknown values and retry/quota notices. Only successful imports use the allowance.
11. With Stripe test keys: complete monthly and annual checkout, replay a webhook and cancel. Existing plans stay editable/exportable. New-trip access and menu quota follow paid entitlement.

Provider tests must run in the providers' free/test environments. No live payment or external messages are part of automated local tests.
