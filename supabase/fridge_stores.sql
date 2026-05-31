-- ============================================================
-- ตู้เย็น: บันทึก config + layout ต่อร้าน (รันใน Supabase SQL Editor)
-- Dashboard → SQL → New query → วางทั้งไฟล์ → Run
-- ============================================================

create table if not exists public.fridge_stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  config jsonb not null default '{"doors":[]}'::jsonb,
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint fridge_stores_name_key unique (name)
);

create index if not exists fridge_stores_name_idx on public.fridge_stores (name);

alter table public.fridge_stores enable row level security;

-- นโยบายเปิดอ่าน/เขียน (เหมาะกับเครื่องภายในร้าน + anon key)
-- ถ้าต้องการล็อกภายหลัง ให้แก้ policy เป็น auth.uid() แทน

drop policy if exists "fridge_stores_select" on public.fridge_stores;
drop policy if exists "fridge_stores_insert" on public.fridge_stores;
drop policy if exists "fridge_stores_update" on public.fridge_stores;
drop policy if exists "fridge_stores_delete" on public.fridge_stores;

create policy "fridge_stores_select"
  on public.fridge_stores for select
  using (true);

create policy "fridge_stores_insert"
  on public.fridge_stores for insert
  with check (true);

create policy "fridge_stores_update"
  on public.fridge_stores for update
  using (true)
  with check (true);

create policy "fridge_stores_delete"
  on public.fridge_stores for delete
  using (true);
