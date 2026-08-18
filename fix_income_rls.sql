-- =============================================================================
-- RLS for income_entries: allow staff (store staff + vendor staff) to add and
-- edit income/operation entries, admin may edit any entry.
-- Run in the Supabase SQL editor (SQL Editor -> New Query -> Run).
-- =============================================================================

ALTER TABLE public.income_entries ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users (pages already scope client-side)
DROP POLICY IF EXISTS income_entries_select ON public.income_entries;
CREATE POLICY income_entries_select ON public.income_entries FOR SELECT TO authenticated
  USING (true);

-- INSERT: anyone can record their own entry
DROP POLICY IF EXISTS income_entries_insert ON public.income_entries;
CREATE POLICY income_entries_insert ON public.income_entries FOR INSERT TO authenticated
  WITH CHECK (recorded_by = auth.uid());

-- UPDATE: edit your own entry; admins may edit any entry; vendor owners may
-- edit entries recorded by anyone in their team (owner or their staff)
DROP POLICY IF EXISTS income_entries_update ON public.income_entries;
CREATE POLICY income_entries_update ON public.income_entries FOR UPDATE TO authenticated
  USING (
    recorded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'vendor'
        AND EXISTS (
          SELECT 1 FROM public.profiles s
          WHERE s.id = income_entries.recorded_by AND s.vendor_id = auth.uid()
        )
    )
  )
  WITH CHECK (
    recorded_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'vendor'
        AND EXISTS (
          SELECT 1 FROM public.profiles s
          WHERE s.id = income_entries.recorded_by AND s.vendor_id = auth.uid()
        )
    )
  );