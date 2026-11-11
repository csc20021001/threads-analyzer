'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const LABEL: Record<string, string> = {
  pending: '排隊中，等待 worker 領取…',
  running: '爬取與分析中…',
  done: '完成',
  failed: '失敗',
};
const FINAL = new Set(['done', 'failed']);

/**
 * 用 Supabase Realtime 訂閱任務狀態，完成時重新整理頁面拿報告。
 * 訂閱建立前任務可能已經做完（mock 幾秒就結束），所以訂閱成功後再查一次；
 * 另外每 15 秒補查一次，以防 Realtime 斷線。
 */
export function JobStatusWatcher({ jobId, initialStatus }: { jobId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const router = useRouter();

  useEffect(() => {
    if (FINAL.has(status)) return;
    const supabase = createClient();
    let closed = false;

    const apply = (next: string | undefined) => {
      if (!next || closed) return;
      setStatus(next);
      if (FINAL.has(next)) router.refresh();
    };
    const recheck = async () => {
      const { data } = await supabase.from('analysis_jobs').select('status').eq('id', jobId).maybeSingle();
      apply(data?.status);
    };

    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Realtime 依 RLS 過濾事件，必須先把使用者的 access token 交給 Realtime，
    // 否則會以 anon 身分訂閱，訂閱成功但一筆事件都收不到。
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (closed) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`job-${jobId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'analysis_jobs', filter: `id=eq.${jobId}` },
          (payload) => apply((payload.new as { status: string }).status),
        )
        .subscribe((s) => { if (s === 'SUBSCRIBED') recheck(); });
    })();
    const timer = setInterval(recheck, 15_000);

    return () => {
      closed = true;
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [jobId, status, router]);

  return <p className="muted">狀態：{LABEL[status] ?? status}</p>;
}
