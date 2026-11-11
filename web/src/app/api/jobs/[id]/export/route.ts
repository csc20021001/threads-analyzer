import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { POST_COLUMNS, toPost, toResult } from '@/lib/results';

const CSV_COLUMNS = [
  'post_id', 'url', 'posted_at_local', 'weekday', 'hour', 'text', 'char_count', 'post_type', 'hashtags', 'mentions', 'url_count',
  'likes', 'replies', 'reposts', 'quotes', 'shares', 'interactions', 'views', 'engagement_rate',
] as const;

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join(' ') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** 匯出單一任務的貼文（CSV）或貼文＋彙總分析（JSON）。走使用者 session，RLS 保證只能匯出自己的資料 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get('format') === 'json' ? 'json' : 'csv';
  const supabase = await createClient();

  const { data: job } = await supabase
    .from('analysis_jobs').select('id, target_username, source, status, finished_at').eq('id', id).maybeSingle();
  if (!job) return NextResponse.json({ error: '找不到這筆分析' }, { status: 404 });
  if (job.status !== 'done') return NextResponse.json({ error: '分析還沒完成' }, { status: 409 });

  const [{ data: rows }, { data: result }] = await Promise.all([
    supabase.from('posts').select(POST_COLUMNS).eq('job_id', id).order('posted_at', { ascending: false }),
    supabase.from('analysis_results').select('*').eq('job_id', id).maybeSingle(),
  ]);
  const name = `threads_${job.target_username}_${(job.finished_at ?? '').slice(0, 10)}`;

  if (format === 'json') {
    const body = JSON.stringify({ job, posts: (rows ?? []).map(toPost), analysis: result ? toResult(result) : null }, null, 2);
    return new NextResponse(body, {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}.json"` },
    });
  }

  const lines = [CSV_COLUMNS.join(','), ...(rows ?? []).map((r: Record<string, unknown>) => CSV_COLUMNS.map((c) => cell(r[c])).join(','))];
  // 前面加 BOM，Excel 開中文才不會亂碼
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` },
  });
}
