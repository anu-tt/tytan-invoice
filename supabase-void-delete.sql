-- Allow a signed-in owner to permanently delete only invoices they previously voided.
-- Run this in the Supabase SQL Editor, then use Sync now in TYTAN BILLBOOK.

revoke delete on table public.invoices from anon, public;
grant delete on table public.invoices to authenticated;

drop policy if exists "owner permanently delete void invoices" on public.invoices;
create policy "owner permanently delete void invoices"
  on public.invoices
  for delete
  to authenticated
  using (
    company_id = public.my_company_id()
    and created_by = auth.uid()
    and deleted_at is not null
  );

notify pgrst, 'reload schema';
