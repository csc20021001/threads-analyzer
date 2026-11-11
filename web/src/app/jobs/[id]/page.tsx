import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AnalysisResult } from '@app/shared';
import { createClient } from '@/lib/supabase/server';
import { JobStatusWatcher } from './JobStatusWatcher';
import { Report } from './Report';

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from('analysis_jobs')
    .select('id, target_username, status, source, error, created_at, finished_at')
    .eq('id', id)
    .maybeSingle();
  if (!job) notFound(); // RLS：別人的任務查不到，等同不存在

  const { data: result } =
    job.status === 'done'
      ? await supabase.from('analysis_results').select('*').eq('job_id', id).maybeSingle()
      : { data: null };

  return (
    <>
      <p><Link href="/dashboard">← 回列表</Link></p>
      <h1>@{job.target_username}</h1>
      <JobStatusWatcher jobId={job.id} initialStatus={job.status} />
      {job.status === 'failed' && <p className="error">{job.error}</p>}
      {result && <Report result={result as unknown as AnalysisResult} source={job.source} />}
    </>
  );
}
