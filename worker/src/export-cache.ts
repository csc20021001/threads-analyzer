/**
 * 把 Supabase scrape_cache 裡某帳號最近一次的原始爬取結果存成 data/<帳號>_<日期>.json，
 * 讓網站跑出來的分析可以用 `npm run report -- <帳號> --from data/...` 在本機重現。
 *
 *   npx tsx --env-file=../.env src/export-cache.ts emoless_com
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseThreadsInput } from '@app/shared';
import { db } from './db.ts';

const username = parseThreadsInput(process.argv[2] ?? '');
if (!username) {
  console.error('用法：npx tsx --env-file=../.env src/export-cache.ts <帳號>');
  process.exit(1);
}
const { data, error } = await db
  .from('scrape_cache')
  .select('payload, source, fetched_at')
  .eq('username', username.toLowerCase())
  .maybeSingle();
if (error || !data) {
  console.error(`找不到 @${username} 的快取`, error?.message ?? '');
  process.exit(1);
}
const fetchedAt = new Date(data.fetched_at).toISOString();
const date = new Date(fetchedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
const root = resolve(import.meta.dirname, '../..');
await mkdir(resolve(root, 'data'), { recursive: true });
const file = resolve(root, 'data', `${username}_${date}.json`);
// 快取只存貼文，沒有停止原因與是否登入；不猜，留空
const meta = { username, fetchedAt, source: data.source, via: 'scrape_cache' };
await writeFile(file, JSON.stringify({ meta, posts: data.payload }, null, 2));
console.log(`已存 ${file}：${(data.payload as unknown[]).length} 篇（${data.source}）`);
