import { Link } from "react-router-dom";
import { ArrowRight } from "@phosphor-icons/react";
import { Logo, Doodle } from "../components/Doodle";

export default function Presentation() {
  return (
    <div className="account-settings">
      <header className="app-header">
        <Link to="/" aria-label="Whereto home">
          <Logo />
        </Link>
        <Link to="/demo" className="text-link">
          Explore the demo <ArrowRight size={17} />
        </Link>
      </header>
      <main className="section-shell pricing-page">
        <div className="section-intro">
          <Doodle name="suitcase" />
          <span className="eyebrow">WHERETO · INTERACTIVE PREVIEW</span>
          <h1>
            Your next adventure,
            <br />
            ready to explore.
          </h1>
          <p>
            Try the itinerary, budget, travel group and planning tools in the
            example trip. Your demo changes stay in this browser.
          </p>
          <Link className="button button-primary" to="/demo">
            Explore the planner <ArrowRight size={18} />
          </Link>
          <p className="fine-print">
            Account creation, cloud sync and subscriptions are available in the
            connected app. This presentation does not create an account or take
            payments.
          </p>
        </div>
      </main>
    </div>
  );
}
