-- 周期记录工具初始表结构。在 Supabase SQL Editor 中执行。

create table public.periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  start_date date not null,
  end_date date, -- null 表示进行中
  source text not null default 'manual' check (source in ('manual', 'import')),
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, start_date),
  check (end_date is null or end_date >= start_date)
);

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  flow text check (flow in ('light', 'medium', 'heavy')),
  pain int check (pain between 0 and 3),
  moods text[] not null default '{}',
  symptoms text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  luteal_days int not null default 14 check (luteal_days between 10 and 18),
  notify_days_before int not null default 2,
  push_subscription jsonb
);

alter table public.periods enable row level security;
alter table public.daily_logs enable row level security;
alter table public.settings enable row level security;

create policy "own periods" on public.periods
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own daily_logs" on public.daily_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own settings" on public.settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
