import { existsSync } from 'node:fs';
import { chromium, type Page, type Response } from 'playwright';
import type { Post } from '@app/shared';
import { config } from '../config.ts';
import { FatalError, sleep } from '../retry.ts';
import { extractPostsFromJson, findImpressionCount } from './extract.ts';

export interface ScrapeResult {
  posts: Post[];
  stoppedBy: 'enough' | 'no-new' | 'login-wall';
  loggedIn: boolean;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * 方法一：開帳號頁、監聽網路回應抓 JSON；回應抓不到東西時用 DOM 補。
 * 停止條件：滿 maxPosts 篇／連續 3 次捲動沒有新貼文／遇到登入牆。
 */
export async function scrapeProfile(username: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: config.headless, channel: config.browserChannel });
  const storageState = config.storageState && existsSync(config.storageState) ? config.storageState : undefined;
  const context = await browser.newContext({
    locale: 'zh-TW',
    viewport: { width: 1280, height: 900 },
    storageState,
  });
  const page = await context.newPage();
  const byId = new Map<string, Post>();
  // 同一篇貼文會在不同回應裡出現，有時只是缺欄位的精簡版；合併時保留已知的值，不讓精簡版蓋掉完整版
  const add = (p: Post) => {
    const prev = byId.get(p.postId);
    if (!prev) { byId.set(p.postId, p); return; }
    byId.set(p.postId, {
      ...prev,
      url: prev.url ?? p.url,
      text: prev.text || p.text,
      postedAt: prev.postedAt ?? p.postedAt,
      likes: Math.max(prev.likes, p.likes),
      replies: Math.max(prev.replies, p.replies),
      reposts: Math.max(prev.reposts, p.reposts),
      quotes: Math.max(prev.quotes, p.quotes),
      shares: Math.max(prev.shares, p.shares),
      views: prev.views ?? p.views,
    });
  };

  const onResponse = async (res: Response) => {
    const url = res.url();
    if (!/\/(api\/)?graphql|\/api\/v1\//.test(url)) return;
    if (!(res.headers()['content-type'] ?? '').includes('json')) return;
    try {
      for (const p of extractPostsFromJson(await res.json(), username)) add(p);
    } catch {
      // 非 JSON 或串流回應，略過
    }
  };
  page.on('response', onResponse);

  try {
    const res = await page.goto(`https://www.threads.com/@${username}`, { waitUntil: 'domcontentloaded' });
    if (res?.status() === 404) throw new FatalError(`找不到帳號 @${username}`);
    await page.waitForTimeout(3000);

    // 首屏貼文通常直接嵌在 HTML 的 <script type="application/json"> 裡，不會走網路請求
    for (const json of await embeddedJson(page)) {
      for (const p of extractPostsFromJson(json, username)) add(p);
    }

    let noNew = 0;
    while (byId.size < config.maxPosts) {
      if (await isLoginWall(page)) return await finish('login-wall');
      const before = byId.size;
      await page.mouse.move(640, 450);
      await page.mouse.wheel(0, 3000);
      await page.keyboard.press('End').catch(() => {});
      await sleep(rand(2000, 4000)); // 捲動間隔 2–4 秒
      // 下一頁的回應有時比較慢，沒有新貼文時多等一下再判定
      if (byId.size === before) await page.waitForResponse((r) => /graphql/.test(r.url()), { timeout: 4000 }).catch(() => {});
      await sleep(300);
      noNew = byId.size === before ? noNew + 1 : 0;
      if (noNew >= 3) break;
    }

    if (byId.size === 0) {
      for (const p of await domFallback(page, username)) add(p);
    }
    return await finish(byId.size >= config.maxPosts ? 'enough' : 'no-new');
  } finally {
    page.off('response', onResponse);
    await browser.close();
  }

  async function finish(stoppedBy: ScrapeResult['stoppedBy']): Promise<ScrapeResult> {
    const posts = [...byId.values()]
      .sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
      .slice(0, config.maxPosts);
    page.off('response', onResponse);
    if (config.fetchViews && stoppedBy !== 'login-wall') await fillViews(page, posts);
    return { posts, stoppedBy, loggedIn: !!storageState };
  }
}

/** 逐篇打開貼文頁補上瀏覽數；每篇間隔 1.5–3 秒，單篇失敗就保留 null，不影響其他篇 */
async function fillViews(page: Page, posts: Post[]) {
  for (const post of posts) {
    if (post.views != null || !post.url) continue;
    let views: number | null = null;
    const onRes = async (res: Response) => {
      if (views != null || !/graphql/.test(res.url())) return;
      try { views = findImpressionCount(await res.json()); } catch {}
    };
    page.on('response', onRes);
    try {
      await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.waitForTimeout(2500);
      if (views == null) {
        for (const json of await embeddedJson(page)) {
          views = findImpressionCount(json);
          if (views != null) break;
        }
      }
    } catch {
      // 這篇抓不到就算了
    } finally {
      page.off('response', onRes);
    }
    post.views = views;
    await sleep(rand(1500, 3000));
  }
}

async function embeddedJson(page: Page): Promise<unknown[]> {
  const raw = await page.$$eval('script[type="application/json"]', (els) => els.map((e) => e.textContent ?? ''));
  return raw.flatMap((t) => {
    try { return [JSON.parse(t)]; } catch { return []; }
  });
}

async function isLoginWall(page: Page): Promise<boolean> {
  if (/\/login/.test(page.url())) return true;
  return page
    .getByRole('dialog')
    .filter({ hasText: /登入|Log in/ })
    .isVisible()
    .catch(() => false);
}

/**
 * 備援：直接讀畫面。只拿得到文字和連結，數字要在實測時確認選擇器。
 * TODO(爬取實測)：補上按讚／回覆／轉發數的選擇器，用 parseCount 解析「1.2萬」。
 */
async function domFallback(page: Page, username: string): Promise<Post[]> {
  const items = await page.$$eval(`a[href*="/@${username}/post/"]`, (links) =>
    links.map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.closest('div')?.textContent ?? '' })),
  );
  const seen = new Set<string>();
  return items.flatMap(({ href, text }) => {
    const code = href.match(/\/post\/([^/?#]+)/)?.[1];
    if (!code || seen.has(code)) return [];
    seen.add(code);
    return [{
      postId: code, url: href, text, postedAt: null,
      likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, views: null,
    }];
  });
}
