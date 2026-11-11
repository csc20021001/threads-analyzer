'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createJob(form: FormData) {
  const username = String(form.get('username') ?? '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    redirect(`/dashboard?error=${encodeURIComponent('帳號格式不正確')}`);
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
