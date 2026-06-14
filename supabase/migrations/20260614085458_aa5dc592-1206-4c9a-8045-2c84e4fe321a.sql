DROP INDEX IF EXISTS public.events_google_unique;
DROP INDEX IF EXISTS public.events_household_google_event_uniq;

ALTER TABLE public.events
ADD CONSTRAINT events_household_google_event_key UNIQUE (household_id, google_event_id);