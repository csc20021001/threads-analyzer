-- 清理後的欄位：存在 posts 上，方便直接用 SQL 查詢與匯出
alter table public.posts
  add column if not exists posted_at_local text,          -- 'YYYY-MM-DD HH:mm'，Asia/Taipei
  add column if not exists weekday smallint check (weekday between 0 and 6),  -- 0 = 週日
  add column if not exists hour smallint check (hour between 0 and 23),
  add column if not exists char_count int not null default 0,
  add column if not exists hashtags text[] not null default '{}',
  add column if not exists mentions text[] not null default '{}',
  add column if not exists url_count int not null default 0,
  add column if not exists post_type text,                 -- 純文字／含連結／含 hashtag／含 mention／混合
  add column if not exists interactions int not null default 0,
  add column if not exists engagement_rate double precision;  -- interactions ÷ views；沒有曝光數時為 null

-- 記錄是哪個 worker（機器、模式、程序）處理的，追查資料來源用
alter table public.analysis_jobs
  add column if not exists worker_info text;

-- 彙總分析結果：每一塊指標一欄
alter table public.analysis_results
  add column if not exists cleaning jsonb not null default '{}',
  add column if not exists overview jsonb not null default '{}',
  add column if not exists time_dist jsonb not null default '{}',
  add column if not exists length_rel jsonb not null default '{}',
  add column if not exists post_types jsonb not null default '[]',
  add column if not exists hashtags jsonb not null default '[]',
  add column if not exists groups jsonb not null default '[]',
  add column if not exists observations jsonb not null default '[]';
