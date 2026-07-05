
CREATE TABLE public.notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  content text NOT NULL,
  color text NOT NULL DEFAULT 'yellow',
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view household notices" ON public.notices
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Members can create household notices" ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (public.is_household_member(household_id, auth.uid()) AND created_by = auth.uid());

CREATE POLICY "Members can update household notices" ON public.notices
  FOR UPDATE TO authenticated
  USING (public.is_household_member(household_id, auth.uid()))
  WITH CHECK (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Author or admin can delete notices" ON public.notices
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.is_household_admin(household_id, auth.uid()));

CREATE TRIGGER notices_set_updated_at
  BEFORE UPDATE ON public.notices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX notices_household_idx ON public.notices(household_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
