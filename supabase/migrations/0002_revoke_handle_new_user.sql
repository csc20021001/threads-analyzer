-- handle_new_user() 是 security definer，只該由 auth.users 的 trigger 觸發。
-- Supabase 預設會把 public schema 函式的 execute 權限給 anon / authenticated，
-- 導致它能透過 /rest/v1/rpc/handle_new_user 被呼叫。trigger 執行不需要 execute 權限，收回不影響註冊。
revoke execute on function public.handle_new_user() from public, anon, authenticated;
