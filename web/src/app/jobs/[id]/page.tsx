import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { POST_COLUMNS, toPost, toResult } from '@/lib/results';
import { JobStatusWatcher } from './JobStatusWatcher';
import { Report } from './Report';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from('analysis_jobs')
    .select('id, target_username, status, source, error, created_at, finished_at, worker_info')
    .eq('id', id)
    .maybeSingle();
  if (!job) notFound(); // RLS：別人的任務查不到，等同不存在

  const done = job.status === 'done';
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
        <h1>@{job.target_username}</h1>
        <JobStatusWatcher jobId={job.id} initialStatus={job.status} />
        {job.status === 'failed' && <p className="error">{job.error}</p>}
        {job.worker_info && <p className="muted small">處理者：{job.worker_info}</p>}
      </div>
      {result && (
        <Report jobId={job.id} result={toResult(result)} posts={(posts ?? []).map(toPost)} source={job.source} />
      )}
    </div>
  );
}
