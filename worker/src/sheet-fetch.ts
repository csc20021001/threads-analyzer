/**
 * 數據分析題：試算表的「貼文摘要」有些被截斷（以「…」結尾）。
 * 逐篇打開貼文頁取得全文，數字仍以試算表為準。
 * 用法：npx tsx --env-file=../.env src/sheet-fetch.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Response } from 'playwright';
import { extractPostsFromJson } from './scrape/extract.ts';

const USER = 'emoless_com';
const input = JSON.parse(readFileSync('../data/sheet_emoless_com_input.json', 'utf8'));
const state = process.env.THREADS_STORAGE_STATE;

const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
const context = await browser.newContext({
  locale: 'zh-TW',
  storageState: state && existsSync(state) ? state : undefined,
});
const page = await context.newPage();
const out: Record<string, { text: string; postedAt: string | null }> = {};

for (const row of input.rows) {
  const url = `https://www.threads.com/@${USER}/post/${row.code}`;
  let text = '';
  let postedAt: string | null = null;
  const take = (json: unknown) => {
    for (const p of extractPostsFromJson(json, USER)) if (p.url === url) { if (p.text.length > text.length) text = p.text; postedAt ??= p.postedAt; }
  };
  const onRes = async (res: Response) => {
    if (!/graphql/.test(res.url())) return;
    try { take(await res.json()); } catch {}
  };
  page.on('response', onRes);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await page.waitForTimeout(2500);
    const raw = await page.$$eval('script[type="application/json"]', (els) => els.map((e) => e.textContent ?? ''));
    for (const t of raw) { try { take(JSON.parse(t)); } catch {} }
  } catch (e) {
    console.error(row.code, (e as Error).message);
  } finally {
    page.off('response', onRes);
  }
  out[row.code] = { text, postedAt };
  console.log(row.code, [...text].length, '字', postedAt);
  await page.waitForTimeout(1500 + Math.random() * 1500);
}
await browser.close();

writeFileSync('../data/sheet_emoless_com_fulltext.json', JSON.stringify(out, null, 2) + '\n');
console.log('done', Object.values(out).filter((x) => x.text).length, '/', input.rows.length);
