
CREATE TABLE public.google_calendar_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expiry timestamptz NOT NULL,
  scope text,
  calendar_id text NOT NULL DEFAULT 'primary',
  last_sync_at timestamptz,
  last_sync_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.google_calendar_tokens TO service_role;
-- intentionally NO grants to anon/authenticated — only server (service_role) reads tokens

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- No policies; only service_role (which bypasses RLS) can access.

CREATE TRIGGER trg_google_tokens_updated_at
  BEFORE UPDATE ON public.google_calendar_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add unique index so we can upsert google events without duplicates
CREATE UNIQUE INDEX IF NOT EXISTS events_google_unique
  ON public.events(household_id, google_event_id)
  WHERE google_event_id IS NOT NULL;
