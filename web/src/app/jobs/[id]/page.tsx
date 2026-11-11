import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { POST_COLUMNS, toLlm, toPost, toResult } from '@/lib/results';
import { deleteJob, rerunJob } from '../../dashboard/actions';
import { JobStatusWatcher } from './JobStatusWatcher';
import { Report } from './Report';

export default async function JobPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from('analysis_jobs')
    .select('id, target_username, status, source, error, created_at, finished_at, worker_info, force_refresh')
    .eq('id', id)
    .maybeSingle();
  if (!job) notFound(); // RLS：別人的任務查不到，等同不存在

  const done = job.status === 'done';
  const finished = done || job.status === 'failed';
  const [{ data: result }, { data: posts }] = done
    ? await Promise.all([
        supabase.from('analysis_results').select('*').eq('job_id', id).maybeSingle(),
        supabase.from('posts').select(POST_COLUMNS).eq('job_id', id).order('posted_at', { ascending: false }),
      ])
    : [{ data: null }, { data: null }];

  return (
    <div className="stack">
      <div className="stack-sm">
        <p><Link href="/dashboard">← 回列表</Link></p>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h1>@{job.target_username}</h1>
          {finished && (
            <div className="row">
              <form action={rerunJob}>
                <input type="hidden" name="id" value={job.id} />
                <button className="secondary">重跑（重新爬取）</button>
              </form>
              <form action={deleteJob}>
                <input type="hidden" name="id" value={job.id} />
                <button className="danger">刪除</button>
              </form>
            </div>
          )}
        </div>
        <JobStatusWatcher jobId={job.id} initialStatus={job.status} />
        {notice && <p className="muted">{notice}</p>}
        {error && <p className="error">{error}</p>}
        {job.status === 'failed' && <p className="error">{job.error}</p>}
        {job.force_refresh && <p className="muted small">這是重跑的任務：略過快取，重新爬取。</p>}
        {job.worker_info && <p className="muted small">處理者：{job.worker_info}</p>}
      </div>
      {result && (
        <Report jobId={job.id} result={toResult(result)} posts={(posts ?? []).map(toPost)} source={job.source} llm={toLlm(result)} />
      )}
    </div>
  );
}
