import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { logout } from '../login/actions';
import { createJob } from './actions';

const STATUS: Record<string, string> = {
  pending: '排隊中', running: '爬取中', done: '完成', failed: '失敗',
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from('analysis_jobs')
    .select('id, target_username, status, created_at, error')
    .order('created_at', { ascending: false })
    .limit(20);

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Threads 帳號分析</h1>
        <form action={logout}><button style={{ background: '#555' }}>登出</button></form>
      </header>

      <form action={createJob} style={{ display: 'flex', gap: 8 }}>
        <input name="username" placeholder="@帳號" required pattern="@?[A-Za-z0-9._]{1,30}" />
        <button>開始分析</button>
      </form>
      {error && <p className="error">{error}</p>}

      <h2>我的分析</h2>
      <table>
        <thead><tr><th>帳號</th><th>狀態</th><th>建立時間</th></tr></thead>
        <tbody>
          {(jobs ?? []).map((j) => (
            <tr key={j.id}>
              <td><Link href={`/jobs/${j.id}`}>@{j.target_username}</Link></td>
              <td>{STATUS[j.status] ?? j.status}{j.error && <span className="error">（{j.error}）</span>}</td>
              <td className="muted">{new Date(j.created_at).toLocaleString('zh-TW')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
