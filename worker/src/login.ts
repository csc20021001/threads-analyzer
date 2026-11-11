/**
 * 開一個瀏覽器視窗讓你手動登入 Threads（用專門爬資料的副帳號），
 * 登入成功後把登入狀態（cookies）存到 .auth/threads.json，之後爬蟲會沿用。
 *
 *   npm run login -w worker
 *
 * 程式不會讀取或記錄帳號密碼，只存 Threads 給瀏覽器的 cookies。
 * .auth/ 已列在 .gitignore 和 .dockerignore，不會進 git 或 Docker 映像。
 */
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const out = process.env.THREADS_STORAGE_STATE || '.auth/threads.json';
const TIMEOUT_MS = 10 * 60_000;
// Threads 沿用 Instagram 的登入 cookie；任一個出現就算登入成功
const SESSION_COOKIES = ['sessionid', 'ds_user_id'];

const browser = await chromium.launch({
  headless: false,
  channel: process.env.BROWSER_CHANNEL || undefined,
});
// 已經有登入狀態就沿用，只需要補完「加入 Threads」那一步
const context = await browser.newContext({
  locale: 'zh-TW',
  storageState: existsSync(out) ? out : undefined,
});
const page = await context.newPage();
await page.goto(existsSync(out) ? 'https://www.threads.com/' : 'https://www.threads.com/login');
console.log('請在跳出的視窗登入 Threads；若出現「使用 Meta 帳號加入」，請按下去完成加入。最多等 10 分鐘…');

/** 有登入 cookie，而且畫面上沒有登入／加入 Threads 的對話框，才算完成 */
async function ready(): Promise<boolean> {
  const cookies = await context.cookies();
  if (!cookies.some((c) => SESSION_COOKIES.includes(c.name) && c.value)) return false;
  if (/\/login/.test(page.url())) return false;
  const blocking = await page
    .getByRole('dialog')
    .filter({ hasText: /加入 Threads|登入|Log in|Join Threads/ })
    .count()
    .catch(() => 1);
  return blocking === 0;
}

// 加入 Threads 的對話框會在頁面載入幾秒後才跳出，太早檢查會誤判成已完成
await page.waitForTimeout(6000);

const start = Date.now();
let ok = false;
let reason = '逾時';
while (Date.now() - start < TIMEOUT_MS) {
  if (page.isClosed()) { reason = '視窗被關掉'; break; }
  if (await ready()) { ok = true; break; }
  await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) {
  // 只印 cookie 名稱和網域方便除錯，不印值
  const names = (await context.cookies().catch(() => [])).map((c) => `${c.name}@${c.domain}`);
  console.log(`沒偵測到登入（${reason}）。目前的 cookies：${names.join(', ') || '無'}`);
  console.log(`最後的網址：${page.isClosed() ? '（已關閉）' : page.url()}`);
}

if (ok) {
  // 到一個公開帳號頁再確認一次，那裡沒加入 Threads 的話一定會跳對話框
  await page.goto('https://www.threads.com/@threads', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(6000);
  if (!(await ready())) {
    console.log('帳號頁仍出現「加入 Threads」對話框，代表還沒完成加入，沒有存檔');
    await browser.close();
    process.exit(1);
  }
  await mkdir(dirname(out), { recursive: true });
  await context.storageState({ path: out });
  console.log(`登入成功，已存到 ${out}`);
} else {
  console.log('沒有存任何東西');
}
await browser.close();
process.exit(ok ? 0 : 1);
