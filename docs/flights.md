# Flights in Whereto

One flight booking contains up to 12 ordered flight segments. It remains one trip item and one financial ledger. Each segment stores airline/flight number, departure and arrival airports, airport-local dates/times, optional UTC-offset confirmation, terminals/gates and separate-ticket transfer information. The booking reference is private and removed from public shares/exports.

## Entering flight information

Choose Flight when adding an item, or open an existing flight. Search airports by IATA code, name or city; add connecting flights in sequence. Dates/times can stay unknown. Costs and payments remain on their existing tabs and are not duplicated for layovers.

The import section accepts pasted booking text and local text-based PDF, TXT or plain-text EML files. File contents are read in the browser, not uploaded or sent to AI. PDFs are limited to 5 MB and 10 pages, and PDF.js loads only when requested. Scans without text have a recoverable manual-entry flow. The parser is conservative: it recognizes explicit airport codes, ISO or English named-month dates, 24/12-hour times and flight-number blocks. It does not cover every airline layout. A preview must be applied explicitly, then the booking is saved normally. No original source text or source file is persisted by this import.

Example format (illustrative schedules, not live flight data):

```text
LH1423
Departure: OTP 2026-10-12 06:00
Arrival: FRA 2026-10-12 07:40

LH1172
Departure: FRA 2026-10-12 09:10
Arrival: LIS 2026-10-12 11:25
```

The bundled directory contains 7,916 IATA airports from [mwgg/Airports](https://github.com/mwgg/Airports), retrieved 8 September 2026; its MIT license is distributed alongside `public/data/airports.json`. Directory lookup, parsing and time calculations require no paid service or AI quota. Saved airport details remain in the trip's offline copy. Directory search needs the local application asset available.

## Consistent behavior

- Elapsed flight/connection times use the airports' IANA time zones, not subtraction of clock labels. Repeated clock-change times require a UTC-offset choice; nonexistent times, reversed segments and impossible flight durations are rejected. Crossing midnight or the international date line is supported.
- The server derives the item's departure, arrival, dates, duration and fixed-booking flag from validated segments. Every known local flight date must lie within the existing trip period; changing flights does not unlock destinations or reset commercial entitlements.
- An overnight flight remains visible on its departure, connection and arrival days. Its cost is assigned to its departure day once; the overall budget always uses the single original item. Ideas remain outside totals.
- Itinerary cards show every airport and the connection duration. Airport changes and separate tickets are called out; short-connection guidance asks the traveler to check airline rules rather than inventing a guaranteed minimum.
- Today uses the saved schedule to identify the current segment/connection and relevant airport. This is scheduled progress, not a live flight-status feed.
- Maps project each departure/connection/arrival airport from the same booking; clicking any airport opens that booking. Lines connect airports and do not claim to be a live aircraft path. Existing map-provider requirements remain unchanged.
- PNG/PDF legends include individual airport-local times and segment details. The fare appears on the booking only; later airport points say it is included. Public outputs omit the booking reference.

Flight-number-only schedule lookup, automatic mailbox scanning and live delays/gate updates are not implemented by this change. Enter or import the booking's actual airport/time details and check the airline for updates. A flight number alone is never used to guess a route or invent a layover.

## Verification

`npm run typecheck`, `npm run build`, `npm test` passed (57 tests). New coverage includes airport search, explicit source parsing, missing data, clock changes, date-line crossings, connection chronology, single-cost/deposit accounting, per-airport map projections, public-reference redaction, overnight visibility and Today connections. Authenticated API tests save/reload segments and reject invalid schedules. Export tests check that all airport markers are requested and extract flight/layover/time-zone text from the generated PDF; rendered PDF/PNG were inspected.

Browser checks on the local demo: import two flights from text, choose an airport with the keyboard, save/reopen, read the supplied test PDF through the real PDF.js browser worker, and review the resulting 90-minute layover. Desktop 1440px and mobile 390px layouts were checked; the mobile document has no horizontal overflow. Reduced-motion CSS disables the segment entrance animation. The existing demo fare is unchanged and its flight schedule is explicitly illustrative.
