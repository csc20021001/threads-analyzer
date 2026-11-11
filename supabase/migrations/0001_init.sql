-- Threads 帳號分析：初始 schema
-- 原則：使用者只能讀寫自己的資料（user_id = auth.uid()）；
-- posts / analysis_results / scrape_cache 只由 worker 用 service role 寫入。

create extension if not exists pgcrypto;

-- ── profiles ───────────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── analysis_jobs ──────────────────────────────────────────
create type public.job_status as enum ('pending', 'running', 'done', 'failed');
create type public.data_source as enum ('playwright', 'api', 'mock');

create table public.analysis_jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  target_username  text not null check (target_username ~ '^[A-Za-z0-9._]{1,30}$'),
  status           public.job_status not null default 'pending',
  source           public.data_source,
  attempts         int not null default 0,
  error            text,
  created_at       timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz
);
create index analysis_jobs_pending_idx on public.analysis_jobs (created_at) where status = 'pending';
create index analysis_jobs_user_idx on public.analysis_jobs (user_id, created_at desc);

-- ── posts ──────────────────────────────────────────────────
create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.analysis_jobs (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  post_id     text not null,
  url         text,
  text        text not null default '',
  posted_at   timestamptz,
  likes       int not null default 0,
  replies     int not null default 0,
  reposts     int not null default 0,
  quotes      int not null default 0,
  views       int,               -- 抓不到曝光數時存 null，不補 0
  raw         jsonb,
  unique (job_id, post_id)
);
create index posts_job_idx on public.posts (job_id);

-- ── analysis_results ───────────────────────────────────────
create table public.analysis_results (
  job_id        uuid primary key references public.analysis_jobs (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  summary       jsonb not null,  -- 篇數、views 覆蓋率等
  top5          jsonb not null,
  correlations  jsonb not null,
  keywords      jsonb not null,
  clusters      jsonb not null,
  created_at    timestamptz not null default now()
);

-- ── scrape_cache（不分使用者，只給 worker 用）─────────────
create table public.scrape_cache (
  username    text primary key,
  fetched_at  timestamptz not null default now(),
  source      public.data_source not null,
  payload     jsonb not null
);

-- ── RLS ────────────────────────────────────────────────────
alter table public.profiles         enable row level security;
alter table public.analysis_jobs    enable row level security;
alter table public.posts            enable row level security;
alter table public.analysis_results enable row level security;
alter table public.scrape_cache     enable row level security;  -- 無 policy = 只有 service role 能碰

create policy "own profile" on public.profiles
  for select using (id = auth.uid());

create policy "read own jobs" on public.analysis_jobs
  for select using (user_id = auth.uid());
create policy "create own jobs" on public.analysis_jobs
  for insert with check (user_id = auth.uid() and status = 'pending');

create policy "read own posts" on public.posts
  for select using (user_id = auth.uid());

create policy "read own results" on public.analysis_results
  for select using (user_id = auth.uid());

-- ── worker 領任務：原子操作，避免兩個 worker 搶同一筆 ─────
create function public.claim_next_job()
returns setof public.analysis_jobs
language sql
security definer set search_path = public
as $$
  update public.analysis_jobs j
     set status = 'running', started_at = now(), attempts = j.attempts + 1
   where j.id = (
     select id from public.analysis_jobs
      where status = 'pending'
      order by created_at
      for update skip locked
      limit 1
   )
  returning j.*;
$$;

revoke all on function public.claim_next_job() from public, anon, authenticated;
grant execute on function public.claim_next_job() to service_role;

-- 讓前端可以即時看到任務狀態變化
alter publication supabase_realtime add table public.analysis_jobs;
