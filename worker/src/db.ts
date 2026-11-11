import { createClient } from '@supabase/supabase-js';
import type { AnalysisResult, DataSource, Post } from '@app/shared';
import { config } from './config.ts';

/**
 * service role key 會繞過 RLS，只能放在 worker 端（不進前端、不進 git）。
 * 因為繞過 RLS，每筆寫入都要自己帶上任務擁有者的 user_id。
 */
export const db = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false },
});

export interface Job {
  id: string;
  user_id: string;
  target_username: string;
}

export async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await db.rpc('claim_next_job');
  if (error) throw error;
  return (data as Job[])[0] ?? null;
}

export async function readCache(username: string): Promise<{ posts: Post[]; source: DataSource } | null> {
  const since = new Date(Date.now() - config.cacheMinutes * 60_000).toISOString();
  const { data } = await db
    .from('scrape_cache')
    .select('payload, source')
    .eq('username', username.toLowerCase())
    .gte('fetched_at', since)
    .maybeSingle();
  return data ? { posts: data.payload as Post[], source: data.source } : null;
}

export async function writeCache(username: string, posts: Post[], source: DataSource) {
  await db.from('scrape_cache').upsert({
    username: username.toLowerCase(), payload: posts, source, fetched_at: new Date().toISOString(),
  });
}

export async function saveResults(job: Job, posts: Post[], result: AnalysisResult, source: DataSource) {
  const rows = posts.map((p) => ({
    job_id: job.id,
    user_id: job.user_id,
    post_id: p.postId,
    url: p.url,
    text: p.text,
    posted_at: p.postedAt,
    likes: p.likes,
    replies: p.replies,
    reposts: p.reposts,
    quotes: p.quotes,
    views: p.views,
  }));
  const ins = await db.from('posts').upsert(rows, { onConflict: 'job_id,post_id' });
  if (ins.error) throw ins.error;

  const res = await db.from('analysis_results').upsert({ job_id: job.id, user_id: job.user_id, ...result });
  if (res.error) throw res.error;

  await finishJob(job.id, { status: 'done', source });
}

export async function finishJob(
  id: string,
  patch: { status: 'done' | 'failed'; source?: DataSource; error?: string },
) {
  const { error } = await db
    .from('analysis_jobs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
