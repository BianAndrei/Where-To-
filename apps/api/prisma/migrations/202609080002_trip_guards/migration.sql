CREATE UNIQUE INDEX "Trip_one_free_per_owner" ON "Trip" ("ownerId") WHERE "isFree" = true;

CREATE FUNCTION whereto_guard_trip() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId" IS DISTINCT FROM OLD."ownerId" OR NEW."isFree" IS DISTINCT FROM OLD."isFree" THEN
    RAISE EXCEPTION 'Trip ownership and free entitlement are immutable';
  END IF;
  IF NEW.state->'destinations' IS DISTINCT FROM OLD.state->'destinations' THEN
    RAISE EXCEPTION 'Destinations are locked';
  END IF;
  IF NEW.state->>'currency' IS DISTINCT FROM OLD.state->>'currency' THEN
    RAISE EXCEPTION 'Budget currency is locked';
  END IF;
  IF (NEW.state->>'startDate' IS DISTINCT FROM OLD.state->>'startDate' OR NEW.state->>'endDate' IS DISTINCT FROM OLD.state->>'endDate')
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.state->'destinations') d WHERE (CURRENT_TIMESTAMP AT TIME ZONE (d->>'timezone'))::date >= (OLD.state->>'startDate')::date) THEN
    RAISE EXCEPTION 'The trip has started. Its dates are now fixed.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Trip_guard" BEFORE UPDATE ON "Trip" FOR EACH ROW EXECUTE FUNCTION whereto_guard_trip();

CREATE FUNCTION whereto_guard_free_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."freeTripClaimedAt" IS NOT NULL AND NEW."freeTripClaimedAt" IS DISTINCT FROM OLD."freeTripClaimedAt" THEN
    RAISE EXCEPTION 'The lifetime free trip entitlement cannot be reset';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Entitlement_guard" BEFORE UPDATE ON "Entitlement" FOR EACH ROW EXECUTE FUNCTION whereto_guard_free_claim();
