-- Run in the Supabase SQL Editor. Each authenticated user gets a private company.
-- Invoice deletion is restricted to voided invoices owned by the signed-in user.
create extension if not exists pgcrypto;

create table if not exists public.companies(
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Anil Enterprises',
  location text not null default 'Okdenganj, Sadev Katra (Ballia)',
  phone text not null default '8318886379',
  email text not null default 'tytandoor@gmail.com',
  website text not null default 'www.tytandoor.com',
  proprietor text not null default 'Khushir Gupta',
  invoice_prefix text not null default 'INV-',
  next_invoice_no bigint not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists public.company_members(
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check(role in('owner','staff')),
  created_at timestamptz not null default now(),
  primary key(company_id,user_id), unique(user_id)
);
create table if not exists public.invoices(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_no text not null,
  invoice_date date not null,
  customer_name text not null,
  customer_phone text default '',
  customer_address text default '',
  items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0,
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(company_id,invoice_no)
);
alter table public.invoices add column if not exists deleted_at timestamptz;
create index if not exists invoices_company_date_idx on public.invoices(company_id,invoice_date desc);

-- Split any legacy shared company by account and preserve invoices by creator.
do $$
declare member_row record; new_company uuid;
begin
  for member_row in
    select m.company_id,m.user_id,c.name,c.location,c.phone,c.email,c.website,c.proprietor,c.invoice_prefix,c.next_invoice_no
    from public.company_members m join public.companies c on c.id=m.company_id
    where (select count(*) from public.company_members x where x.company_id=m.company_id)>1
      and m.user_id<>(select x.user_id from public.company_members x where x.company_id=m.company_id order by x.created_at,x.user_id limit 1)
  loop
    insert into public.companies(name,location,phone,email,website,proprietor,invoice_prefix,next_invoice_no)
    values(member_row.name,member_row.location,member_row.phone,member_row.email,member_row.website,member_row.proprietor,member_row.invoice_prefix,member_row.next_invoice_no)
    returning id into new_company;
    update public.invoices set company_id=new_company where company_id=member_row.company_id and created_by=member_row.user_id;
    update public.company_members set company_id=new_company where company_id=member_row.company_id and user_id=member_row.user_id;
  end loop;
end
$$;

-- Advance counters past all legacy invoices before the insert trigger is used.
update public.companies c
set next_invoice_no=coalesce((
  select max(substring(i.invoice_no from '([0-9]+)$')::bigint)+1
  from public.invoices i where i.company_id=c.id
),1);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.invoices enable row level security;

-- Revoke broad/default privileges, then grant only operations needed by the app.
revoke all on public.companies,public.company_members,public.invoices from public,anon,authenticated;
grant select,update on public.companies to authenticated;
grant select on public.company_members to authenticated;
grant select,insert,update,delete on public.invoices to authenticated;

create or replace function public.my_company_id()
returns uuid language sql stable security definer set search_path=public,pg_temp
as $$ select company_id from public.company_members where user_id=auth.uid() limit 1 $$;

-- Never attach a new login to another user's company. Create a private one lazily.
create or replace function public.claim_company()
returns uuid language plpgsql security definer set search_path=public,pg_temp
as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select company_id into cid from public.company_members where user_id=auth.uid();
  if cid is not null then return cid; end if;
  insert into public.companies default values returning id into cid;
  insert into public.company_members(company_id,user_id,role) values(cid,auth.uid(),'owner')
  on conflict(user_id) do nothing;
  select company_id into cid from public.company_members where user_id=auth.uid();
  return cid;
end
$$;

create or replace function public.next_invoice_number()
returns text language sql stable security definer set search_path=public,pg_temp
as $$
  select invoice_prefix||lpad(next_invoice_no::text,3,'0')
  from public.companies where id=public.my_company_id()
$$;

-- Assign the number inside the same transaction as invoice creation. Abandoned
-- drafts and failed inserts therefore do not consume a number.
create or replace function public.assign_invoice_number()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare current_no text; candidate text; n bigint; p text;
begin
  select invoice_no into current_no from public.invoices where id=new.id;
  if current_no is not null then
    new.invoice_no:=current_no;
    return new;
  end if;
  select next_invoice_no,invoice_prefix into n,p
  from public.companies where id=new.company_id for update;
  if n is null then raise exception 'Company not found'; end if;
  candidate:=p||lpad(n::text,3,'0');
  while exists(select 1 from public.invoices where company_id=new.company_id and invoice_no=candidate) loop
    n:=n+1;
    candidate:=p||lpad(n::text,3,'0');
  end loop;
  update public.companies set next_invoice_no=n+1 where id=new.company_id;
  new.invoice_no:=candidate;
  return new;
end
$$;
drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number before insert on public.invoices
for each row execute function public.assign_invoice_number();

do $$
declare policy_row record;
begin
  for policy_row in select schemaname,tablename,policyname from pg_policies
   where schemaname='public' and tablename in('companies','company_members','invoices')
  loop
    execute format('drop policy %I on %I.%I',policy_row.policyname,policy_row.schemaname,policy_row.tablename);
  end loop;
end
$$;

create policy "owner read company" on public.companies for select to authenticated using(id=public.my_company_id());
create policy "owner update company" on public.companies for update to authenticated using(id=public.my_company_id()) with check(id=public.my_company_id());
create policy "owner read membership" on public.company_members for select to authenticated using(user_id=auth.uid());
create policy "owner read invoices" on public.invoices for select to authenticated using(company_id=public.my_company_id());
create policy "owner insert invoices" on public.invoices for insert to authenticated with check(company_id=public.my_company_id() and created_by=auth.uid());
create policy "owner update invoices" on public.invoices for update to authenticated using(company_id=public.my_company_id() and created_by=auth.uid()) with check(company_id=public.my_company_id() and created_by=auth.uid());
create policy "owner permanently delete void invoices" on public.invoices for delete to authenticated using(company_id=public.my_company_id() and created_by=auth.uid() and deleted_at is not null);

revoke all on function public.my_company_id() from public,anon;
revoke all on function public.claim_company() from public,anon;
revoke all on function public.next_invoice_number() from public,anon;
revoke all on function public.assign_invoice_number() from public,anon,authenticated;
grant execute on function public.my_company_id() to authenticated;
grant execute on function public.claim_company() to authenticated;
grant execute on function public.next_invoice_number() to authenticated;

alter table public.invoices replica identity full;
do $$ begin alter publication supabase_realtime add table public.invoices; exception when duplicate_object then null; end $$;

-- Make newly created/replaced RPC functions visible to Supabase's REST API.
notify pgrst, 'reload schema';
