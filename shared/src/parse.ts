/**
 * 把畫面上的數字字串轉成整數。
 * "1.2萬" → 12000、"3.4K" → 3400、"1,234" → 1234、"5億" → 500000000。
 * 解析不了回傳 null。
 */
export function parseCount(input: string | number | null | undefined): number | null {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input) : null;

  const s = input.replace(/[,\s]/g, '').trim();
  if (s === '') return null;

  const m = s.match(/^(\d+(?:\.\d+)?)(萬|万|億|亿|[KkMmBb])?$/);
  if (!m) return null;

  const n = Number(m[1]);
  const unit = m[2];
  const mult: Record<string, number> = {
    萬: 1e4, 万: 1e4, 億: 1e8, 亿: 1e8,
    k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9,
  };
  return Math.round(unit ? n * mult[unit] : n);
}

/**
 * 接受帳號或網址，回傳小寫 username；格式不對回傳 null。
 * "@emoless_com"、"emoless_com"、"https://www.threads.com/@emoless_com"、
 * "threads.net/@emoless_com/post/Dd8EL_MGx4Z" 都會得到 "emoless_com"。
 */
export function parseThreadsInput(input: string): string | null {
  let s = input.trim();
  const m = s.match(/threads\.(?:net|com)\/@([A-Za-z0-9._]{1,30})/i);
  if (m) s = m[1];
  else if (/^https?:\/\//i.test(s) || /threads\.(?:net|com)/i.test(s)) return null;
  s = s.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}
