import Link from 'next/link';
import type { Overview, TimeDist } from '@app/shared';
import { createClient } from '@/lib/supabase/server';

const pct = (x: number | null | undefined) => (x == null ? '—' : `${(x * 100).toFixed(2)}%`);
const num = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('en-US'));

/** 多帳號比較：從列表勾選兩個以上已完成的分析 */
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const raw = (await searchParams).ids;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).slice(0, 6);
  const supabase = await createClient();
  const { data } = ids.length
    ? await supabase
        .from('analysis_results')
        .select('job_id, overview, time_dist, observations, analysis_jobs(target_username, source, finished_at)')
        .in('job_id', ids)
    : { data: [] };
  const rows = (data ?? []).map((r: any) => ({
    id: r.job_id as string,
    username: r.analysis_jobs?.target_username as string,
    source: r.analysis_jobs?.source as string,
    ov: r.overview as Overview,
    td: r.time_dist as TimeDist,
    top: (r.observations?.[0]?.title as string) ?? '—',
  }));

  const metrics: { label: string; get: (r: (typeof rows)[number]) => string }[] = [
    { label: '資料來源', get: (r) => r.source },
    { label: '貼文數', get: (r) => num(r.ov.postCount) },
    { label: '期間', get: (r) => `${r.ov.dateFrom?.slice(5, 10) ?? '—'} – ${r.ov.dateTo?.slice(5, 10) ?? '—'}` },
    { label: '平均讚', get: (r) => num(r.ov.avgLikes) },
    { label: '平均回覆', get: (r) => num(r.ov.avgReplies) },
    { label: '平均轉發', get: (r) => num(r.ov.avgReposts) },
    { label: '平均分享', get: (r) => num(r.ov.avgShares) },
    { label: '平均曝光', get: (r) => num(r.ov.avgViews) },
    { label: '整體互動率', get: (r) => pct(r.ov.overallRate) },
    { label: '總互動中位數', get: (r) => num(r.ov.medianInteractions) },
    { label: '最常發文時段', get: (r) => (r.td.busiestHour ? `${r.td.busiestHour.key} 點` : '—') },
    { label: '互動最高時段', get: (r) => (r.td.bestHour ? `${r.td.bestHour.key} 點` : '—') },
    { label: '最大差異觀察', get: (r) => r.top },
  ];

  return (
    <div className="stack">
      <div className="stack-sm">
        <p><Link href="/dashboard">← 回列表</Link></p>
        <h1>多帳號比較</h1>
        {rows.length < 2 && <p className="muted">請回列表勾選兩個以上已完成的分析。</p>}
      </div>
      {rows.length >= 1 && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>指標</th>{rows.map((r) => <th key={r.id}><Link href={`/jobs/${r.id}`}>@{r.username}</Link></th>)}</tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.label}><td className="muted">{m.label}</td>{rows.map((r) => <td key={r.id}>{m.get(r)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
