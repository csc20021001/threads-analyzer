-- 重跑：重跑的任務略過 30 分鐘快取，一定重新爬
alter table public.analysis_jobs
  add column if not exists force_refresh boolean not null default false;

-- 刪除：只能刪自己的任務，而且不能刪還在跑的（posts、analysis_results 會跟著 cascade 刪除）
create policy "delete own finished jobs" on public.analysis_jobs
  for delete using (user_id = auth.uid() and status in ('done', 'failed'));

-- LLM 內容策略建議：沒設定 ANTHROPIC_API_KEY 時為 null，畫面改顯示規則式建議
alter table public.analysis_results
  add column if not exists llm_suggestions jsonb,
  add column if not exists llm_model text;
