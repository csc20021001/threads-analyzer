export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 失敗最多重試 3 次，間隔 2s → 4s → 8s。fatal 錯誤（例如帳號不存在）不重試 */
export async function withRetry<T>(fn: () => Promise<T>, delays = [2000, 4000, 8000]): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e instanceof FatalError || i === delays.length) break;
      console.warn(`[retry] 第 ${i + 1} 次失敗，${delays[i] / 1000}s 後重試：`, (e as Error).message);
      await sleep(delays[i]);
    }
  }
  throw last;
}

export class FatalError extends Error {}
