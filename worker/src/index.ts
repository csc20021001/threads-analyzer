import { hostname } from 'node:os';
import { analyze, cleanPosts, type DataSource, type Post } from '@app/shared';
import { config } from './config.ts';
import { claimNextJob, finishJob, readCache, saveResults, writeCache, type Job } from './db.ts';
import { withRetry, sleep } from './retry.ts';
import { scrapeProfile } from './scrape/playwright.ts';
import { mockPosts } from './scrape/mock.ts';
import { llmEnabled, suggest } from './llm.ts';

// 寫進每筆任務，事後查得到是哪台機器、哪個模式處理的（之前曾有殘留的舊 worker 用 mock 搶走任務）
const WORKER_INFO = `${hostname()}・${config.source}・pid ${process.pid}・啟動於 ${new Date().toISOString()}`;

async function fetchPosts(username: string, forceRefresh = false): Promise<{ posts: Post[]; source: DataSource }> {
  const cached = forceRefresh ? null : await readCache(username, config.source);
  if (forceRefresh) console.log(`[job] @${username} 重跑：略過快取，重新爬取`);
  if (cached) {
    console.log(`[job] @${username} 用 ${config.cacheMinutes} 分鐘內的 ${cached.source} 快取`);
    return cached;
  }

  if (config.source === 'mock') {
    return { posts: mockPosts(username, config.maxPosts), source: 'mock' };
  }

  const { posts, stoppedBy } = await withRetry(() => scrapeProfile(username));
  console.log(`[job] @${username} 取得 ${posts.length} 篇，停止原因：${stoppedBy}`);
  if (posts.length === 0) throw new Error(stoppedBy === 'login-wall' ? '遇到登入牆，抓不到貼文' : '抓不到任何貼文');

  await writeCache(username, posts, 'playwright');
  return { posts, source: 'playwright' };
}

async function runJob(job: Job) {
  console.log(`[job] ${job.id} 開始 @${job.target_username}`);
  try {
    const { posts: raw, source } = await fetchPosts(job.target_username, job.force_refresh);
    const { posts } = cleanPosts(raw);
    if (posts.length < 5) throw new Error(`資料不足：只取得 ${posts.length} 篇貼文，至少需要 5 篇才能分析`);
    const result = analyze(raw);
    const llm = await suggest(job.target_username, result);
    await saveResults(job, posts, result, source, WORKER_INFO, llm);
    console.log(`[job] ${job.id} 完成（${source}，${posts.length} 篇${llm ? `，LLM 建議 ${llm.items.length} 條` : ''}）`);
  } catch (e) {
    console.error(`[job] ${job.id} 失敗`, e);
    await finishJob(job.id, { status: 'failed', error: (e as Error).message.slice(0, 500), worker_info: WORKER_INFO });
  }
}

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });

console.log(`[worker] 啟動：${WORKER_INFO}，每 ${config.pollMs / 1000}s 輪詢`);
if (config.source === 'mock') console.warn('[worker] ⚠ 目前是 mock 模式，產生的報告都是假資料');
console.log(`[worker] LLM 建議：${llmEnabled() ? '開啟' : '關閉（未設定 ANTHROPIC_API_KEY，改顯示規則式觀察）'}`);
while (!stopping) {
  const job = await claimNextJob().catch((e) => {
    console.error('[worker] 領任務失敗', e);
    return null;
  });
  if (job) await runJob(job);
  else await sleep(config.pollMs);
}
console.log('[worker] 結束');
