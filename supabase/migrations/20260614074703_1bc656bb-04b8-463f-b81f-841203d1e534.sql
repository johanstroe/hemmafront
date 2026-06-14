CREATE OR REPLACE FUNCTION public.add_creator_as_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.household_members (household_id, user_id, display_name, avatar_color, role)
  VALUES (NEW.id, NEW.created_by, 'Admin', '#5E7153', 'admin')
  ON CONFLICT (household_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS households_add_creator ON public.households;
CREATE TRIGGER households_add_creator
AFTER INSERT ON public.households
FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_admin();