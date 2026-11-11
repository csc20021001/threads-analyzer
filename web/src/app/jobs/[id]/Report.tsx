import type { AnalysisResult } from '@app/shared';

const pct = (x: number | null) => (x == null ? '—' : `${(x * 100).toFixed(2)}%`);
const CLUSTER: Record<string, string> = { high: '高互動', mid: '中互動', low: '低互動' };
const METRIC: Record<string, string> = {
  length: '字數', hour: '發文時段', hasQuestion: '含問句', hasLink: '含連結',
};

export function Report({ result, source }: { result: AnalysisResult; source: string | null }) {
  const { summary, top5, correlations, keywords, clusters } = result;
  return (
    <>
      <p className="muted">
        共 {summary.postCount} 篇・資料來源 {source ?? '—'}・曝光數覆蓋 {pct(summary.viewsCoverage)}
        {summary.rankedBy === 'interactions' && '・曝光數不足，Top 5 改用互動量排序'}
      </p>

      <h2>Top 5 貼文</h2>
      <table>
        <thead><tr><th>內容</th><th>互動</th><th>曝光</th><th>互動率</th></tr></thead>
        <tbody>
          {top5.map((p) => (
            <tr key={p.postId}>
              <td>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.text.slice(0, 80) || '（無文字）'}</a> : p.text.slice(0, 80)}</td>
              <td>{p.interactions}</td>
              <td>{p.views ?? '—'}</td>
              <td>{pct(p.rate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>特徵與表現（Spearman）</h2>
      <ul>
        {correlations.map((c) => (
          <li key={c.metric}>{METRIC[c.metric]}：{c.rho == null ? '資料不足' : c.rho.toFixed(2)}（n={c.n}）</li>
        ))}
      </ul>

      <h2>關鍵字</h2>
      <p>{keywords.map((k) => k.term).join('、') || '—'}</p>

      <h2>分群</h2>
      <ul>
        {clusters.map((c) => (
          <li key={c.name}>{CLUSTER[c.name]}（{c.postIds.length} 篇）：{c.label ?? '—'}</li>
        ))}
      </ul>
    </>
  );
}
