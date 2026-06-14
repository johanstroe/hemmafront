-- Ensure upserts on (household_id, google_event_id) work
CREATE UNIQUE INDEX IF NOT EXISTS events_household_google_event_uniq
  ON public.events (household_id, google_event_id)
  WHERE google_event_id IS NOT NULL;
