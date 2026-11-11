import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { logout } from '../login/actions';
import { createJob } from './actions';

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: '排隊中', tone: 'info' },
  running: { label: '爬取中', tone: 'info' },
  done: { label: '完成', tone: 'ok' },
  failed: { label: '失敗', tone: 'bad' },
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: jobs } = await supabase
    .from('analysis_jobs')
    .select('id, target_username, status, source, created_at, error')
    .order('created_at', { ascending: false })
    .limit(30);
  const done = (jobs ?? []).filter((j) => j.status === 'done');

  return (
    <div className="stack">
      <header className="topbar">
        <div>
          <h1>Threads 帳號分析</h1>
          <p className="muted">{user?.email}</p>
        </div>
        <form action={logout}><button className="secondary">登出</button></form>
      </header>

      <section className="card stack-sm">
        <h2>新增分析</h2>
        <form action={createJob} className="row">
          <input name="username" placeholder="帳號或網址，例如 emoless_com 或 https://www.threads.com/@emoless_com" required style={{ flex: 1, minWidth: 0 }} />
          <button>開始分析</button>
        </form>
        <p className="muted small">會抓最近 30 篇主貼文，並逐篇打開貼文頁取得曝光數，一個帳號約需 3–4 分鐘。</p>
        {error && <p className="error">{error}</p>}
        {notice && <p className="muted">{notice}</p>}
      </section>

      <section className="stack-sm">
        <h2>我的分析</h2>
        {(jobs ?? []).length === 0 ? (
          <p className="muted">還沒有分析紀錄。在上方輸入一個帳號開始。</p>
        ) : (
          <form action="/compare" className="stack-sm">
            <div className="tablewrap">
              <table>
                <thead><tr><th>比較</th><th>帳號</th><th>狀態</th><th>資料來源</th><th>建立時間</th></tr></thead>
                <tbody>
                  {(jobs ?? []).map((j) => (
                    <tr key={j.id}>
                      <td>{j.status === 'done' && <input type="checkbox" name="ids" value={j.id} aria-label={`比較 @${j.target_username}`} />}</td>
                      <td><Link href={`/jobs/${j.id}`}>@{j.target_username}</Link></td>
                      <td>
                        <span className={`pill ${STATUS[j.status]?.tone ?? ''}`}>{STATUS[j.status]?.label ?? j.status}</span>
                        {j.error && <span className="error small">　{j.error}</span>}
                      </td>
                      <td>{j.source ? <span className={`pill ${j.source === 'playwright' ? 'ok' : 'warn'}`}>{j.source}</span> : '—'}</td>
                      <td className="muted">{new Date(j.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {done.length >= 2 && <div><button className="secondary">比較勾選的帳號</button></div>}
          </form>
        )}
      </section>
    </div>
  );
}
