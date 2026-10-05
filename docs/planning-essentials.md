# Planning essentials

The planner toolbar now connects six tools to the existing trip state. They are included in the first free trip and remain usable on existing trips after subscription expiry. These features do not consume the AI menu-import allowance.

## Reservations

**Import a booking** reads hotel, train/transport and activity confirmations from text, PDF or photos. The existing flight importer remains available. The reservation panel also lists saved bookings, searchable by title or private reference.

Text extraction and image recognition run in the browser. The parser recognises explicit labelled dates, names, references and totals; it does not guess an ambiguous date, currency, location or price. Review and complete the existing item editor before saving. Select locations separately from a permitted map source; extracted addresses are hints, not automatically verified coordinates. A booking total is not treated as money already paid.

Saving creates one itinerary item, its cost lines and a private document. Correcting the extracted text preserves the original uploaded file; **Use pasted text instead** explicitly replaces it with a text attachment. Matching file hashes, references and dated titles help detect duplicates, including a previously deleted item with the same file. Saving again cannot attach the same file to another item. Two concurrent saves use the existing trip version check and a database transaction. A retry of an unchanged successful import returns its saved result; changed content with a stale version requires reloading.

Supported files: PDF, PNG, JPEG, WebP, TXT and plain-text EML; 8 MB per file, at most 10 PDF pages and 100,000 extracted characters. The existing 100 MB document allowance per trip applies. Scanned PDFs use local OCR. The first OCR use downloads the reader and language data; failed downloads, timeouts and unreadable files offer a paste/manual fallback. This is file upload and paste, not an email forwarding service or a guarantee of parsing every airline/hotel template. Demo mode reviews files but does not upload private attachments.

## Airport transfers

A saved flight with airport details and a dated, located stay can produce an arrival or departure transfer reminder. Candidate stays must cover the relevant date and be within 150 km of the airport. The comparison shows train/metro, bus and taxi separately. Each option has its own group/per-person price basis, duration and number of changes; missing values remain unknown. Confirm passenger coverage, bags, departure time and the selected estimate before saving.

Authenticated trips can query configured Google Routes for train/bus and Geoapify for driving time. These requests respect existing integration pauses and caps. Google transit results are shown in a separate dialog, without the map, and are not persisted as provider content. A returned fare is informational until the traveller checks its passenger coverage and enters an estimate. Taxi fares and pickup wait are not supplied by the driving route. No provider results are fabricated in demo or when services are unavailable; manual comparisons remain available. Live routes require configured keys and coverage.

One selected transfer becomes an itinerary transport item with group cost and map endpoints. Local time is validated against the linked flight, including timezone offsets. An arrival transfer cannot leave before landing; a departure transfer cannot reach the airport after takeoff. Airport processing/baggage allowances are still the traveller's decision. New timed bookings, transfers and poll choices are inserted before later stops without rearranging the rest of the day.

## Receipts and shares

**Split a receipt** starts from an existing planned meal. Upload a photo/PDF or paste text, then check every line total, remove included subtotals/tax, add missing tips or charges, and assign each purchase or discount to participants. Discounts cannot make a person's purchases negative. The rows must add up exactly to the confirmed bill total. Currency and any conversion rate/date need confirmation.

Saving replaces the meal's estimate with one confirmed cost line and itemised allocation weights; existing payments are preserved. It neither adds a second meal nor claims the bill has been paid. Record payments in the existing Payments tab. The original source stays private. Decimal arithmetic preserves the receipt total and shares. The generic editor protects an attached receipt's calculation; explicitly detach that calculation before replacing it manually. A receipt file cannot be linked to multiple meals.

## Group decisions

Create a poll from two to eight saved restaurant/activity ideas. Authenticated collaborators can vote and change their one vote; the server binds it to their actual account. The organiser chooses the final option and day and confirms the effect. Only that idea becomes planned and enters the budget. Other options stay as ideas. While a poll is open, its options cannot be deleted or promoted independently. Only the owner can resolve or cancel it. Concurrent confirmation cannot create two winners. Public share links contain no polls or voter identities.

## Packing and missing details

The existing checklist offers suggestions based on duration, flights and planned activities, with optional beach, hiking, city, work and swimming themes. Select suggestions before adding them; already listed suggestions are omitted. It uses deterministic templates, no AI or weather feed.

**What's still missing?** checks uncovered nights (checkout is exclusive), outstanding airport transfers, planned items without cost lines, and booked balances with a payment deadline overdue or within seven days. Each reminder opens the relevant day, cost/payment editor or transfer tool. Zero-cost items explicitly entered as zero are distinct from unestimated items. These checks depend on saved data and do not claim the trip is complete in every respect.

## Landing and verification

The landing explains all six tools and includes a labelled interactive example: read a confirmation, review a €420 stay, see its day/map/budget, then add an illustrative €18 transfer and resolve the gap. Sample prices and geography are identified as examples. Pastel artwork, custom controls and reduced-motion support follow the existing brand.

Coverage is in `tests/planning.test.ts` and authenticated PostgreSQL tests in `tests/api.test.ts`: parsing uncertainty, exact receipt shares/payments, private fields and documents, duplicate and concurrent saves, stale edits, actor-bound voting, owner-only resolution, chronology, transfer detection, night coverage and checklist deduplication. Synthetic files for manual browser checks are generated by `npx tsx scripts/planning-fixtures.ts`. Provider live results require separate verification with configured accounts.
