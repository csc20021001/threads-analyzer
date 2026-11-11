function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`缺少環境變數 ${name}`);
  return v;
}

export const config = {
  supabaseUrl: need('SUPABASE_URL'),
  serviceRoleKey: need('SUPABASE_SERVICE_ROLE_KEY'),
  pollMs: Number(process.env.POLL_MS ?? 5000),
  maxPosts: Number(process.env.MAX_POSTS ?? 30),
  cacheMinutes: Number(process.env.CACHE_MINUTES ?? 30),
  headless: process.env.HEADLESS !== 'false',
  /** 用本機已安裝的瀏覽器，例如 Windows 上的 'msedge'；不填就用 Playwright 自帶的 Chromium（Docker 裡用這個） */
  browserChannel: process.env.BROWSER_CHANNEL || undefined,
  /** 副帳號登入狀態檔；檔案存在就以登入身分爬，不存在就用未登入模式 */
  storageState: process.env.THREADS_STORAGE_STATE || undefined,
  /** 'playwright'（預設）或 'mock'：沒網路／被擋時用假資料跑通整條流程 */
  source: (process.env.DATA_SOURCE ?? 'playwright') as 'playwright' | 'mock',
};
