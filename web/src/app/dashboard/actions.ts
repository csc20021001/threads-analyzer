'use server';
import { redirect } from 'next/navigation';
import { parseThreadsInput } from '@app/shared';
import { createClient } from '@/lib/supabase/server';

export async function createJob(form: FormData) {
  const username = parseThreadsInput(String(form.get('username') ?? ''));
  if (!username) {
    redirect(`/dashboard?error=${encodeURIComponent('請輸入 Threads 帳號（例如 emoless_com）或帳號網址（例如 https://www.threads.com/@emoless_com）')}`);
  }

  const supabase = await createClient();
  // user_id 由資料庫 default auth.uid() 帶入，RLS 確保只能建自己的任務
  const { data, error } = await supabase
    .from('analysis_jobs')
    .insert({ target_username: username })
    .select('id')
    .single();

  if (error) redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  redirect(`/jobs/${data.id}`);
}
