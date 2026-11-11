import { createClient } from '@supabase/supabase-js';
import type { AnalysisResult, CleanPost, DataSource, Post } from '@app/shared';
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
  force_refresh?: boolean; // 使用者按「重跑」建立的任務：略過快取
}

export interface LlmSuggestions {
  model: string;
  items: { title: string; detail: string; basis: string }[];
}

export async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await db.rpc('claim_next_job');
  if (error) throw error;
  return (data as Job[])[0] ?? null;
}

/** 只讀「和目前資料來源相同」的快取，避免 mock 和真實資料混在一起 */
export async function readCache(username: string, source: DataSource): Promise<{ posts: Post[]; source: DataSource } | null> {
  const since = new Date(Date.now() - config.cacheMinutes * 60_000).toISOString();
  const { data } = await db
    .from('scrape_cache')
    .select('payload, source')
    .eq('username', username.toLowerCase())
    .eq('source', source)
    .gte('fetched_at', since)
    .maybeSingle();
  return data ? { posts: data.payload as Post[], source: data.source } : null;
}

export async function writeCache(username: string, posts: Post[], source: DataSource) {
  await db.from('scrape_cache').upsert({
    username: username.toLowerCase(), payload: posts, source, fetched_at: new Date().toISOString(),
  });
}

export async function saveResults(
  job: Job, posts: CleanPost[], result: AnalysisResult, source: DataSource, workerInfo: string,
  llm: LlmSuggestions | null,
) {
  const rows = posts.map((p) => ({
    job_id: job.id,
    user_id: job.user_id,
    post_id: p.postId,
    url: p.url,
    text: p.text,
    posted_at: p.postedAt,
    posted_at_local: p.postedAtLocal,
    weekday: p.weekday,
    hour: p.hour,
    likes: p.likes,
    replies: p.replies,
    reposts: p.reposts,
    quotes: p.quotes,
    shares: p.shares,
    views: p.views,
    char_count: p.charCount,
    hashtags: p.hashtags,
    mentions: p.mentionList,
    url_count: p.urlCount,
    post_type: p.postType,
    interactions: p.interactions,
    engagement_rate: p.rate,
  }));
  const ins = await db.from('posts').upsert(rows, { onConflict: 'job_id,post_id' });
  if (ins.error) throw ins.error;

  const res = await db.from('analysis_results').upsert({
    job_id: job.id,
    user_id: job.user_id,
    summary: result.summary,
    cleaning: result.cleaning,
    overview: result.overview,
    top5: result.top5,
    time_dist: result.timeDist,
    length_rel: result.lengthRel,
    post_types: result.postTypes,
    hashtags: result.hashtags,
    correlations: result.correlations,
    keywords: result.keywords,
    clusters: result.clusters,
    groups: result.groups,
    observations: result.observations,
    llm_suggestions: llm?.items ?? null,
    llm_model: llm?.model ?? null,
  });
  if (res.error) throw res.error;

  await finishJob(job.id, { status: 'done', source, worker_info: workerInfo });
}

export async function finishJob(
  id: string,
  patch: { status: 'done' | 'failed'; source?: DataSource; error?: string; worker_info?: string },
) {
  const { error } = await db
    .from('analysis_jobs')
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
