'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function creds(form: FormData) {
  return { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
}

export async function login(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(creds(form));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect('/dashboard');
}

export async function signup(form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(creds(form));
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (!data.session) redirect(`/login?message=${encodeURIComponent('請到信箱點確認連結後再登入')}`);
  redirect('/dashboard');
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
