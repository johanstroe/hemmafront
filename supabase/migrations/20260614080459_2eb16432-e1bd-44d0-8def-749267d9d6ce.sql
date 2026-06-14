
-- 1. google_calendar_tokens: owner-only policies
CREATE POLICY "Users manage own google tokens (select)" ON public.google_calendar_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users manage own google tokens (insert)" ON public.google_calendar_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own google tokens (update)" ON public.google_calendar_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users manage own google tokens (delete)" ON public.google_calendar_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2. Restrict invite_code column visibility
REVOKE SELECT (invite_code) ON public.households FROM authenticated;
REVOKE SELECT (invite_code) ON public.households FROM anon;

-- Admin-only RPC to read the invite code
CREATE OR REPLACE FUNCTION public.get_household_invite_code(_household_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
BEGIN
  IF NOT public.is_household_admin(_household_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT invite_code INTO _code FROM public.households WHERE id = _household_id;
  RETURN _code;
END;
$$;

-- Secure RPC to join a household by invite code (no need to read the code)
CREATE OR REPLACE FUNCTION public.join_household_with_invite(
  _invite_code text,
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
  SELECT id INTO _hh_id FROM public.households
    WHERE invite_code = upper(trim(_invite_code));
  IF _hh_id IS NULL THEN
    RAISE EXCEPTION 'Invite code not found';
  END IF;
  INSERT INTO public.household_members (household_id, user_id, display_name, avatar_color, role)
    VALUES (_hh_id, _uid, _display_name, _avatar_color, 'member')
    ON CONFLICT (household_id, user_id) DO NOTHING;
  RETURN _hh_id;
END;
$$;

-- 3. Lock down EXECUTE on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.is_household_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_household_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_creator_as_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_household(text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_household_invite_code(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_household_with_invite(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_household_invite_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_household_with_invite(text, text, text) TO authenticated;
