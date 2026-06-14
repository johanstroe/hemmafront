-- ============================================================
-- PHASE 1: CREATE ALL TABLES
-- ============================================================

CREATE TABLE public.households (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invite_code text NOT NULL UNIQUE DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.household_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name text NOT NULL,
    avatar_color text NOT NULL DEFAULT '#5E7153',
    role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (household_id, user_id)
);

CREATE TABLE public.events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text,
    start_time timestamptz NOT NULL,
    end_time timestamptz,
    all_day boolean NOT NULL DEFAULT false,
    member_id uuid REFERENCES public.household_members(id) ON DELETE SET NULL,
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'google')),
    google_event_id text,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    household_id uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
    name text NOT NULL,
    type text NOT NULL DEFAULT 'shopping' CHECK (type IN ('shopping', 'reminders', 'todos')),
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.list_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
    content text NOT NULL,
    completed boolean NOT NULL DEFAULT false,
    completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at timestamptz,
    created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PHASE 2: GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.households TO authenticated;
GRANT ALL ON public.households TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.household_members TO authenticated;
GRANT ALL ON public.household_members TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lists TO authenticated;
GRANT ALL ON public.lists TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_items TO authenticated;
GRANT ALL ON public.list_items TO service_role;

-- ============================================================
-- PHASE 3: ENABLE RLS + CREATE POLICIES
-- ============================================================

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their households"
ON public.households FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = households.id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Creators can update their households"
ON public.households FOR UPDATE
TO authenticated
USING (created_by = auth.uid());

CREATE POLICY "Users can create households"
ON public.households FOR INSERT
TO authenticated
WITH CHECK (created_by = auth.uid());

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view members of their households"
ON public.household_members FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members AS my_membership
        WHERE my_membership.household_id = household_members.household_id
        AND my_membership.user_id = auth.uid()
    )
);

CREATE POLICY "Admins can manage members"
ON public.household_members FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members AS my_membership
        WHERE my_membership.household_id = household_members.household_id
        AND my_membership.user_id = auth.uid()
        AND my_membership.role = 'admin'
    )
);

CREATE POLICY "Users can join with invite code"
ON public.household_members FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view events in their households"
ON public.events FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = events.household_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create events in their households"
ON public.events FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = events.household_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update their own events"
ON public.events FOR UPDATE
TO authenticated
USING (
    created_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = events.household_id
        AND household_members.user_id = auth.uid()
        AND household_members.role = 'admin'
    )
);

CREATE POLICY "Users can delete their own events"
ON public.events FOR DELETE
TO authenticated
USING (
    created_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = events.household_id
        AND household_members.user_id = auth.uid()
        AND household_members.role = 'admin'
    )
);

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lists in their households"
ON public.lists FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = lists.household_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create lists in their households"
ON public.lists FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = lists.household_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update lists in their households"
ON public.lists FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = lists.household_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Admins can delete lists"
ON public.lists FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.household_members
        WHERE household_members.household_id = lists.household_id
        AND household_members.user_id = auth.uid()
        AND household_members.role = 'admin'
    )
);

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view items in their household lists"
ON public.list_items FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.lists
        JOIN public.household_members ON household_members.household_id = lists.household_id
        WHERE lists.id = list_items.list_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can create items in their household lists"
ON public.list_items FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.lists
        JOIN public.household_members ON household_members.household_id = lists.household_id
        WHERE lists.id = list_items.list_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can update items in their household lists"
ON public.list_items FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.lists
        JOIN public.household_members ON household_members.household_id = lists.household_id
        WHERE lists.id = list_items.list_id
        AND household_members.user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete items in their household lists"
ON public.list_items FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.lists
        JOIN public.household_members ON household_members.household_id = lists.household_id
        WHERE lists.id = list_items.list_id
        AND household_members.user_id = auth.uid()
    )
);

-- ============================================================
-- PHASE 4: TRIGGERS + REALTIME
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER households_updated_at
    BEFORE UPDATE ON public.households
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER events_updated_at
    BEFORE UPDATE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER lists_updated_at
    BEFORE UPDATE ON public.lists
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER list_items_updated_at
    BEFORE UPDATE ON public.list_items
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lists;