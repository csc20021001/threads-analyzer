/** 純 SVG 圖表，不依賴圖表套件；顏色走 globals.css 的主題變數，深淺色都能讀 */

const nice = (max: number) => {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};
const fmt = (x: number) => (Number.isInteger(x) ? x.toLocaleString('en-US') : x.toFixed(1));

interface Bar { label: string; value: number; note?: string }

/** 直條圖：value 決定高度，note 印在柱子上方（例如平均互動） */
export function BarChart({
  title, subtitle, data, unit, alt = false, labelEvery = 1,
}: { title: string; subtitle?: string; data: Bar[]; unit: string; alt?: boolean; labelEvery?: number }) {
  const W = 560, H = 220, L = 34, R = 8, T = 18, B = 28;
  const max = nice(Math.max(...data.map((d) => d.value), 0));
  const bw = (W - L - R) / data.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, max / 2, max];
  return (
    <figure className="chart" style={{ margin: 0 }}>
      <h3>{title}</h3>
      {subtitle && <p className="muted small">{subtitle}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}：${data.map((d) => `${d.label} ${fmt(d.value)}${unit}`).join('，')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = L + i * bw;
          const h = H - B - y(d.value);
          return (
            <g key={d.label}>
              <rect className={`bar${alt ? ' alt' : ''}`} x={x + bw * 0.15} y={y(d.value)} width={bw * 0.7} height={Math.max(h, d.value > 0 ? 1 : 0)} rx={2}>
                <title>{`${d.label}：${fmt(d.value)}${unit}${d.note ? `，${d.note}` : ''}`}</title>
              </rect>
              {d.note && d.value > 0 && <text className="val" x={x + bw / 2} y={y(d.value) - 4} textAnchor="middle">{d.note}</text>}
              {i % labelEvery === 0 && <text x={x + bw / 2} y={H - 10} textAnchor="middle">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      <p className="muted small">縱軸：{unit}；量尺 0–{fmt(max)}</p>
    </figure>
  );
}

/** 散佈圖：字數 × 總互動 */
export function ScatterChart({
  title, subtitle, points, xLabel, yLabel,
}: { title: string; subtitle?: string; points: { x: number; y: number; id: string }[]; xLabel: string; yLabel: string }) {
  const W = 560, H = 240, L = 40, R = 12, T = 12, B = 34;
  const mx = nice(Math.max(...points.map((p) => p.x), 1));
  const my = nice(Math.max(...points.map((p) => p.y), 1));
  const sx = (v: number) => L + (W - L - R) * (v / mx);
  const sy = (v: number) => T + (H - T - B) * (1 - v / my);
  return (
    <figure className="chart" style={{ margin: 0 }}>
      <h3>{title}</h3>
      {subtitle && <p className="muted small">{subtitle}</p>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}，共 ${points.length} 篇`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line className="grid" x1={L} x2={W - R} y1={sy(my * f)} y2={sy(my * f)} />
            <text x={L - 6} y={sy(my * f) + 4} textAnchor="end">{fmt(my * f)}</text>
            <text x={sx(mx * f)} y={H - 18} textAnchor="middle">{fmt(mx * f)}</text>
          </g>
        ))}
        {points.map((p) => (
          <circle key={p.id} className="dot" cx={sx(p.x)} cy={sy(p.y)} r={4.5}>
            <title>{`${xLabel} ${p.x}，${yLabel} ${p.y}`}</title>
          </circle>
        ))}
        <text x={(L + W - R) / 2} y={H - 3} textAnchor="middle">{xLabel}</text>
      </svg>
      <p className="muted small">橫軸：{xLabel}（0–{fmt(mx)}）；縱軸：{yLabel}（0–{fmt(my)}）</p>
    </figure>
  );
}
