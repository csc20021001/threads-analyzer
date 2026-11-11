-- Threads 的「分享」（紙飛機）數，對應題目試算表的「引用」欄；計入總互動
alter table public.posts add column if not exists shares int not null default 0;
