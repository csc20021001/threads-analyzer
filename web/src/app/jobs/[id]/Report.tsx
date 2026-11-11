import type { AnalysisResult, CleanPost } from '@app/shared';
import { BarChart, ScatterChart } from './Charts';

const pct = (x: number | null | undefined, d = 2) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const num = (x: number | null | undefined) => (x == null ? '—' : x.toLocaleString('en-US'));
/** 圖表柱子上方的小字：千以上縮寫成 k，避免數字擠在一起 */
const short = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1)}k` : String(Math.round(x * 10) / 10));
const CLUSTER: Record<string, string> = { high: '高互動群', mid: '中互動群', low: '低互動群' };
const VERDICT: Record<string, { label: string; tone: string }> = {
  success: { label: '成功原因', tone: 'ok' },
  failure: { label: '失敗原因', tone: 'bad' },
  mixed: { label: '加分與扣分', tone: 'warn' },
};
const METRIC: Record<string, string> = { length: '字數', hour: '發文時段', hasQuestion: '含問句', hasLink: '含連結' };

export function Report({
  jobId, result, posts, source,
}: { jobId: string; result: AnalysisResult; posts: CleanPost[]; source: string | null }) {
  const { overview: ov, cleaning, timeDist, lengthRel, postTypes, hashtags, keywords, groups, observations, top5, correlations } = result;
  const rankedByRate = result.summary.rankedBy === 'rate';

  return (
    <div className="stack">
      <section className="stack-sm">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>總覽</h2>
          <div className="row">
            <a className="button secondary" href={`/api/jobs/${jobId}/export?format=csv`}>下載 CSV</a>
            <a className="button secondary" href={`/api/jobs/${jobId}/export?format=json`}>下載 JSON</a>
          </div>
        </div>
        <p className="muted small">
          資料來源 <span className={`pill ${source === 'playwright' ? 'ok' : 'warn'}`}>{source ?? '—'}</span>
          {source === 'mock' && <b className="error">　這是假資料，不代表真實帳號。</b>}
          　期間 {ov.dateFrom ?? '—'} 至 {ov.dateTo ?? '—'}（台灣時間）・曝光數覆蓋 {pct(ov.viewsCoverage, 0)}
        </p>
        <div className="tiles">
          <div className="tile"><b>{ov.postCount}</b><span>貼文數</span></div>
          <div className="tile"><b>{num(ov.avgLikes)}</b><span>平均讚</span></div>
          <div className="tile"><b>{num(ov.avgReplies)}</b><span>平均回覆</span></div>
          <div className="tile"><b>{num(ov.avgReposts)}</b><span>平均轉發</span></div>
          <div className="tile"><b>{num(ov.avgQuotes)}</b><span>平均引用</span></div>
          <div className="tile"><b>{num(ov.avgShares)}</b><span>平均分享</span></div>
          <div className="tile"><b>{num(ov.avgViews)}</b><span>平均曝光</span></div>
          <div className="tile"><b>{pct(ov.overallRate)}</b><span>整體互動率</span></div>
        </div>
        <p className="muted small">
          清理：原始 {cleaning.inputCount} 筆，去除重複 {cleaning.duplicatesRemoved} 筆；缺發文時間 {cleaning.missing.postedAt}、缺曝光數 {cleaning.missing.views}、缺內文 {cleaning.missing.text}、缺網址 {cleaning.missing.url}。
          總互動 = 讚 + 回覆 + 轉發 + 引用 + 分享；互動率 = 總互動 ÷ 曝光數。
        </p>
      </section>

      <section className="stack-sm">
        <h2>內容策略觀察</h2>
        <ol className="obs">
          {observations.map((o, i) => (
            <li key={i}>
              <h3>{i + 1}. {o.title}</h3>
              <p>{o.detail}</p>
              <p className="muted small">依據：{o.evidence}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="stack-sm">
        <h2>Top 5 貼文（依{rankedByRate ? '互動率' : '總互動'}排序）</h2>
        {rankedByRate
          ? <p className="muted small">只排曝光數 ≥ {num(result.summary.rateMinViews)} 的貼文（全體第 25 百分位），避免剛發、曝光很少的貼文因分母小而排在前面。</p>
          : <p className="muted small">曝光數不足一半，改用總互動排序。</p>}
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>內容</th><th>發文時間</th><th className="n">讚</th><th className="n">回覆</th><th className="n">總互動</th><th className="n">曝光</th><th className="n">互動率</th></tr></thead>
            <tbody>
              {top5.map((p, i) => (
                <tr key={p.postId}>
                  <td>{i + 1}</td>
                  <td className="excerpt">{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{[...p.text].slice(0, 70).join('') || '（無文字）'}</a> : [...p.text].slice(0, 70).join('')}</td>
                  <td className="muted small">{p.postedAtLocal ?? '—'}</td>
                  <td className="n">{num(p.likes)}</td>
                  <td className="n">{num(p.replies)}</td>
                  <td className="n">{num(p.interactions)}</td>
                  <td className="n">{num(p.views)}</td>
                  <td className="n">{pct(p.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack-sm">
        <h2>發文時間分布</h2>
        <p className="muted small">
          最常發文：{timeDist.busiestWeekday?.label ?? '—'}、{timeDist.busiestHour?.key ?? '—'} 點。
          平均互動最高（至少 2 篇）：{timeDist.bestWeekday?.label ?? '—'}、{timeDist.bestHour ? `${timeDist.bestHour.key} 點` : '—'}。
        </p>
        <div className="grid2">
          <BarChart
            title="星期幾發文"
            subtitle="柱高為篇數，上方數字為該天平均總互動"
            unit="篇"
            data={timeDist.byWeekday.map((b) => ({ label: b.label.replace('週', ''), value: b.count, note: b.count ? short(b.avgInteractions) : undefined }))}
          />
          <BarChart
            title="幾點發文"
            subtitle="台灣時間；柱高為篇數，上方數字為平均總互動"
            unit="篇"
            labelEvery={3}
            alt
            data={timeDist.byHour.map((b) => ({ label: String(b.key), value: b.count, note: b.count ? short(b.avgInteractions) : undefined }))}
          />
        </div>
      </section>

      <section className="stack-sm">
        <h2>文字長度與互動</h2>
        <p className="muted small">
          Spearman 相關：字數 × 總互動 {lengthRel.rhoInteractions ?? '—'}；字數 × 互動率 {lengthRel.rhoRate ?? '—'}。
          {lengthRel.buckets.map((b) => `${b.label}（${b.range}）${b.count} 篇平均 ${b.avgInteractions}`).join('；')}。
        </p>
        <div className="grid2">
          <ScatterChart
            title="字數 × 總互動"
            subtitle="每個點是一篇貼文"
            xLabel="字數"
            yLabel="總互動"
            points={lengthRel.points.map((p) => ({ id: p.postId, x: p.charCount, y: p.interactions }))}
          />
          <BarChart
            title="貼文類型"
            subtitle="柱高為篇數，上方數字為平均總互動"
            unit="篇"
            data={postTypes.map((t) => ({ label: t.type, value: t.count, note: t.count ? short(t.avgInteractions) : undefined }))}
          />
        </div>
      </section>

      <section className="grid2">
        <div className="stack-sm">
          <h2>常見關鍵字</h2>
          <p className="muted small">中文斷詞（Intl.Segmenter）後以 TF-IDF 排序，只列出現在 2 篇以上的詞。</p>
          <p>{keywords.map((k) => k.term).join('、') || '—'}</p>
        </div>
        <div className="stack-sm">
          <h2>Hashtag</h2>
          <p>{hashtags.length ? hashtags.map((h) => `#${h.tag}（${h.count}）`).join('、') : '這段期間沒有使用 hashtag。'}</p>
          <h3>其他特徵相關（Spearman，對{rankedByRate ? '互動率' : '總互動'}）</h3>
          <p className="small">{correlations.map((c) => `${METRIC[c.metric]} ${c.rho ?? '資料不足'}`).join('；')}</p>
        </div>
      </section>

      <section className="stack-sm">
        <h2>分群與 NLP 分析</h2>
        <p className="muted small">
          分群：讚數和回覆數各取百分位排名後平均，依分數三等分。NLP：每篇代表貼文都用同一套文本特徵（字數、句數、第一人稱密度、結尾提問、具體數字、對話、敘事時間標記、引言型、情緒詞），
          以全體貼文計算各特徵和總互動的 Spearman 相關決定加分或扣分方向，再取偏離全體平均最多的項目寫成原因。
        </p>
        {groups.map((g) => (
          <div className="group" key={g.name}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3>{CLUSTER[g.name]}（{g.count} 篇）：{g.label}</h3>
              <span className="muted small">平均讚 {g.avgLikes}・平均回覆 {g.avgReplies}</span>
            </div>
            <p className="small">{g.summary}</p>
            {g.samples.map((s) => (
              <div className="sample" key={s.postId}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="excerpt">{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.excerpt}</a> : s.excerpt}</span>
                  <span className="small muted">讚 {s.likes}・回覆 {s.replies}・總互動 {s.interactions}</span>
                </div>
                <span><span className={`pill ${VERDICT[s.verdict].tone}`}>{VERDICT[s.verdict].label}</span></span>
                <ul className="small">{s.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="stack-sm">
        <h2>全部貼文（清理後）</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>發文時間</th><th>內容</th><th>類型</th><th className="n">字數</th><th>#／@／連結</th>
                <th className="n">讚</th><th className="n">回覆</th><th className="n">轉發</th><th className="n">引用</th><th className="n">分享</th><th className="n">曝光</th><th className="n">互動率</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.postId}>
                  <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{p.postedAtLocal ?? '—'}</td>
                  <td className="excerpt small">{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{[...p.text].slice(0, 40).join('')}</a> : [...p.text].slice(0, 40).join('')}</td>
                  <td className="small">{p.postType}</td>
                  <td className="n">{p.charCount}</td>
                  <td className="small">{p.hashtags.length}／{p.mentionList.length}／{p.urlCount}</td>
                  <td className="n">{num(p.likes)}</td>
                  <td className="n">{num(p.replies)}</td>
                  <td className="n">{num(p.reposts)}</td>
                  <td className="n">{num(p.quotes)}</td>
                  <td className="n">{num(p.shares)}</td>
                  <td className="n">{num(p.views)}</td>
                  <td className="n">{pct(p.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
