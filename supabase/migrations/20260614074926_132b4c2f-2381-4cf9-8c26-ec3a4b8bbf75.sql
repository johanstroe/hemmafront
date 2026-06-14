CREATE OR REPLACE FUNCTION public.create_household(
  _name text,
  _display_name text,
  _avatar_color text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _hh_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.households (name, created_by)
  VALUES (_name, _uid)
  RETURNING id INTO _hh_id;

  INSERT INTO public.household_members (household_id, user_id, display_name, avatar_color, role)
  VALUES (_hh_id, _uid, _display_name, _avatar_color, 'admin')
  ON CONFLICT (household_id, user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        avatar_color = EXCLUDED.avatar_color,
        role = 'admin';

  RETURN _hh_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_household(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_household(text, text, text) TO authenticated;