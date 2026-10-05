# Landing refinement

The landing keeps Whereto's warm paper, apricot, mint, dusty rose and blue palette, the Nunito hierarchy and the existing SVG artwork. The signature element is a flat travel folio: six selectable tools reveal a small, labelled example in a shared space. This replaces the long six-article feature grid without adding another scrolling section.

- Hero: a secondary link lets visitors try the planner before creating an account. The first-trip arrow and original travel illustration remain.
- Feature folio: bookings, transfers, receipt shares, group votes, packing and loose ends each have a distinct sample. Tabs have roving focus, arrow/Home/End keyboard controls and linked panels. Examples are explicitly illustrative.
- Budget: visitors choose no payment, a €150 deposit or full payment. The same €600 booking updates its balance and paid progress. The existing React Bits CountUp adaptation animates the amounts; keyboard, reduced-motion and paused modes update immediately.
- Reservation demo: four visible progress steps explain reading, reviewing, adding to the plan and resolving the next step. Existing archive-derived postcard reveal remains.
- Closing: the free-trip CTA is followed by a quieter route into the demo.

Motion prioritises short, smooth transitions (280 ms for a pointer-selected folio example, 300 ms for payment progress). No autoplaying slides, new ambient loops or scroll interception are introduced. The folio reserves its panel height to avoid moving the following sections when switching examples. Mobile uses a two-column selector and one-column content.

Checks: frontend TypeScript and production build; desktop hero/folio/budget inspection; all six folio panels at phone width, narrow 320 px layout; keyboard tab selection and payment changes; no horizontal overflow in the inspected panels. Existing authenticated application behaviour is unchanged.
