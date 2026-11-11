'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { parseThreadsInput } from '@app/shared';
import { createClient } from '@/lib/supabase/server';

const fail = (msg: string, to = '/dashboard') => redirect(`${to}?error=${encodeURIComponent(msg)}`);

/** 同一帳號已有排隊中或執行中的任務，就直接帶使用者去那一筆，不重複建立 */
async function activeJobFor(username: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('analysis_jobs')
    .select('id')
    .eq('target_username', username)
    .in('status', ['pending', 'running'])
    .limit(1)
    .maybeSingle();
  return data?.id as string | undefined;
}

export async function createJob(form: FormData) {
  const username = parseThreadsInput(String(form.get('username') ?? ''));
  if (!username) {
    fail('請輸入 Threads 帳號（例如 emoless_com）或帳號網址（例如 https://www.threads.com/@emoless_com）');
  }

  const existing = await activeJobFor(username!);
  if (existing) redirect(`/jobs/${existing}?notice=${encodeURIComponent('這個帳號已經在分析中，不重複建立任務')}`);

  const supabase = await createClient();
  // user_id 由資料庫 default auth.uid() 帶入，RLS 確保只能建自己的任務
  const { data, error } = await supabase
    .from('analysis_jobs')
    .insert({ target_username: username })
    .select('id')
    .single();

  if (error) fail(error.message);
  redirect(`/jobs/${data!.id}`);
}

/** 重跑：以同一帳號建立新任務，並略過快取一定重新爬取；舊任務保留作為歷史紀錄 */
export async function rerunJob(form: FormData) {
  const id = String(form.get('id') ?? '');
  const supabase = await createClient();
  const { data: job } = await supabase.from('analysis_jobs').select('target_username').eq('id', id).maybeSingle();
  if (!job) fail('找不到這筆任務');

  const existing = await activeJobFor(job!.target_username);
  if (existing) redirect(`/jobs/${existing}?notice=${encodeURIComponent('這個帳號已經在分析中，不重複建立任務')}`);

  const { data, error } = await supabase
    .from('analysis_jobs')
    .insert({ target_username: job!.target_username, force_refresh: true })
    .select('id')
    .single();
  if (error) fail(error.message, `/jobs/${id}`);
  redirect(`/jobs/${data!.id}`);
}

/** 刪除：RLS 只允許刪自己已完成或失敗的任務；貼文與分析結果會一併刪除 */
export async function deleteJob(form: FormData) {
  const id = String(form.get('id') ?? '');
  const supabase = await createClient();
  const { data, error } = await supabase.from('analysis_jobs').delete().eq('id', id).select('id');
  if (error) fail(error.message, `/jobs/${id}`);
  if (!data?.length) fail('無法刪除：任務不存在、不屬於你，或仍在執行中', `/jobs/${id}`);
  revalidatePath('/dashboard');
  redirect(`/dashboard?notice=${encodeURIComponent('已刪除任務與它的貼文、分析結果')}`);
}
