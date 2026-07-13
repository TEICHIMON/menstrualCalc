-- 健康记录：屏幕时间、锻炼、头晕、颈椎提醒设置。在 Supabase SQL Editor 中执行（在 001 之后）。

alter table public.daily_logs
  add column dizziness int check (dizziness between 0 and 3);

alter table public.settings
  add column devices text[] not null default '{手机1,手机2,iPad,电脑}',
  add column neck_reminder_enabled boolean not null default false,
  add column neck_reminder_interval int not null default 60
    check (neck_reminder_interval between 15 and 240);

create table public.screen_time (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  device text not null,
  minutes int not null check (minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  unique (user_id, date, device)
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  mode text not null,
  duration_min int not null check (duration_min between 1 and 1440),
  avg_hr int check (avg_hr between 30 and 250),
  calories int check (calories between 0 and 10000),
  source text not null default 'manual' check (source in ('manual', 'import')),
  created_at timestamptz not null default now()
);

alter table public.screen_time enable row level security;
alter table public.workouts enable row level security;

create policy "own screen_time" on public.screen_time
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own workouts" on public.workouts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
