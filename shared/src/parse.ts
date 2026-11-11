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
