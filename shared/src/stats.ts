/** 平均名次（處理同分），回傳 1-based rank */
export function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Spearman 等級相關；樣本少於 3 或任一邊沒有變異時回傳 null */
export function spearman(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const m = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - m, b = ry[i] - m;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

export const spearmanSafe = (x: number[], y: number[]) => {
  const r = spearman(x, y);
  return r == null ? null : Number(r.toFixed(2));
};
