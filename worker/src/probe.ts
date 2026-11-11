/**
 * 爬取可行性實測：開一個帳號頁，把所有 JSON 回應存到 probe-out/，
 * 用來確認 Threads 現在的欄位名稱、有沒有曝光數、未登入能捲多深。
 *
 *   npm run probe -w worker -- <username>
 *
 * 不需要 Supabase，不寫資料庫。
 */
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { extractPostsFromJson } from './scrape/extract.ts';

const username = process.argv[2];
if (!username) {
  console.error('用法：npm run probe -w worker -- <username>');
  process.exit(1);
}

await rm('probe-out', { recursive: true, force: true });
await mkdir('probe-out', { recursive: true });
const browser = await chromium.launch({
  headless: process.env.HEADLESS === 'true',
  channel: process.env.BROWSER_CHANNEL || undefined,
});
const state = process.env.THREADS_STORAGE_STATE;
const page = await browser.newPage({
  locale: 'zh-TW',
  viewport: { width: 1280, height: 900 },
  storageState: state && existsSync(state) ? state : undefined,
});
let n = 0;
let found = 0;

page.on('response', async (res) => {
  if (!(res.headers()['content-type'] ?? '').includes('json')) return;
  try {
    const json = await res.json();
    const file = `probe-out/${String(++n).padStart(3, '0')}.json`;
    await writeFile(file, JSON.stringify({ url: res.url(), json }, null, 2));
    const posts = extractPostsFromJson(json, username);
    found += posts.length;
    console.log(`${file}  ${res.url().slice(0, 80)}  貼文 ${posts.length}`);
  } catch {}
});

await page.goto(`https://www.threads.com/@${username}`);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(3000);
}
console.log(`共存 ${n} 個回應，辨識出 ${found} 筆貼文（含重複）。目前網址：${page.url()}`);
await browser.close();
