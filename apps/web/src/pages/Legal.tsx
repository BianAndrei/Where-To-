import { useLocation } from "react-router-dom";
import { MarketingNav, Footer } from "./Landing";
export default function Legal() {
  const privacy = useLocation().pathname === "/privacy";
  return (
    <>
      <MarketingNav />
      <main className="legal section-shell">
        <span className="eyebrow">THE DETAILS</span>
        <h1>{privacy ? "Your plans are personal." : "A few ground rules."}</h1>
        {privacy ? (
          <>
            <h2>What Whereto stores</h2>
            <p>
              Your account details, trip plans, expenses, participants and files
              are stored so you can return to them and collaborate with people
              you invite. Public share links exclude private documents and hide
              budgets and accommodation unless you choose otherwise.
            </p>
            <h2>External services</h2>
            <p>
              Place searches and maps may use Geoapify and Google. Menu text is
              sent to Groq for extraction and translation when you request an
              import. Personal trip documents are not automatically sent to AI.
              Stripe handles subscription payments; Whereto does not store your
              card details.
            </p>
            <h2>Local and offline data</h2>
            <p>
              Your last opened private trip can be kept on this device for
              offline reading. Logging out clears the local trip copy. Files
              downloaded explicitly remain on your device until you delete them.
              Essential session cookies keep you signed in.
            </p>
            <h2>Sharing and control</h2>
            <p>
              You can revoke public links, remove uploaded files and archive
              trips. Only share travel information with people you trust. Before
              public launch, the operator must supply its legal identity,
              contact details, retention periods and a working account deletion
              process.
            </p>
          </>
        ) : (
          <>
            <h2>Your first trip</h2>
            <p>
              One complete trip is free per verified account. Deleting or
              archiving it does not grant another free trip. Destinations are
              fixed when you confirm creation. Dates become fixed when the trip
              starts. Nearby day trips within 100 km are allowed.
            </p>
            <h2>Subscriptions</h2>
            <p>
              Whereto costs €5 per month or €40 per year. You can cancel renewal
              in the billing portal. Existing trips remain editable and
              exportable after expiry; creating further trips and renewing the
              menu allowance requires an active subscription.
            </p>
            <h2>Menus and travel information</h2>
            <p>
              Imported menus are estimates, not guaranteed current prices or
              restaurant orders. Review the original source, currency and
              prices. Travel times and availability depend on providers.
              Bookings and travel payments are completed with those providers.
            </p>
            <h2>Service allowances</h2>
            <p>
              The first trip includes 10 successful menu imports; a subscription
              includes 30 per month with no rollover. Shared free provider
              quotas can temporarily delay automatic services. Manual planning
              remains available.
            </p>
            <h2>Before commercial launch</h2>
            <p>
              This local implementation does not identify a legal operator yet.
              Operator contact details, applicable tax configuration,
              cancellation and statutory consumer-rights information must be
              completed before accepting live payments.
            </p>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
