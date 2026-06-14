
CREATE OR REPLACE FUNCTION public.is_household_member(_household_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household_id AND user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(_household_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.household_members WHERE household_id = _household_id AND user_id = _user_id AND role = 'admin')
$$;

DROP POLICY IF EXISTS "Users can view members of their households" ON public.household_members;
DROP POLICY IF EXISTS "Admins can manage members" ON public.household_members;
DROP POLICY IF EXISTS "Users can view their households" ON public.households;

CREATE POLICY "Users can view members of their households" ON public.household_members
  FOR SELECT TO authenticated
  USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "Admins can manage members" ON public.household_members
  FOR ALL TO authenticated
  USING (public.is_household_admin(household_id, auth.uid()))
  WITH CHECK (public.is_household_admin(household_id, auth.uid()));

CREATE POLICY "Users can view their households" ON public.households
  FOR SELECT TO authenticated
  USING (public.is_household_member(id, auth.uid()));
