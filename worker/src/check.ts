/**
 * 檢查 Supabase 是否接好：連線、資料表、claim_next_job()。
 *   npm run check -w worker
 * 只讀，不會寫入任何資料。
 */
import { db } from './db.ts';

const tables = ['profiles', 'analysis_jobs', 'posts', 'analysis_results', 'scrape_cache'];
let ok = true;

for (const t of tables) {
  const { error } = await db.from(t).select('*', { head: true, count: 'exact' });
  console.log(`${error ? '✗' : '✓'} 資料表 ${t}${error ? `：${error.message}` : ''}`);
  if (error) ok = false;
}

// 只在沒有排隊任務時呼叫，這樣不會真的領走任何一筆
const { count: pending } = await db
  .from('analysis_jobs')
  .select('*', { head: true, count: 'exact' })
  .eq('status', 'pending');
if (pending) {
  console.log(`- 函式 claim_next_job()：有 ${pending} 筆排隊中的任務，略過檢查`);
} else {
  const { error: fnErr } = await db.rpc('claim_next_job');
  console.log(`${fnErr ? '✗' : '✓'} 函式 claim_next_job()${fnErr ? `：${fnErr.message}` : ''}`);
  if (fnErr) ok = false;
}

console.log(ok ? '\nSupabase 已接好。' : '\n還有項目沒過，請確認 0001_init.sql 已在 SQL Editor 執行。');
process.exit(ok ? 0 : 1);
