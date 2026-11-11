import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export type CookieList = { name: string; value: string; options: CookieOptions }[];

/** Server Component / Route Handler / Server Action 用；帶使用者 session，受 RLS 限制 */
export async function createClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: CookieList) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // 在 Server Component 裡呼叫時不能寫 cookie，交給 middleware 更新
          }
        },
      },
    },
  );
}
