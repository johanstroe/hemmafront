ALTER TABLE public.list_items
ADD COLUMN parent_id uuid REFERENCES public.list_items(id) ON DELETE CASCADE;

CREATE INDEX list_items_parent_id_idx ON public.list_items(parent_id);
