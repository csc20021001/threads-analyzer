/**
 * 不經過網站和資料庫，直接產出分析報告：
 *
 *   npm run report -w worker -- emoless_com                 # 用 Playwright 爬取，存 data/ 再出報告
 *   npm run report -w worker -- emoless_com --from data/emoless_com_2026-11-11.json   # 用已存的資料重出報告
 *
 * 輸出：
 *   data/<帳號>_<日期>.json      爬到的原始貼文（清理前）
 *   reports/<帳號>_<日期>.md     Markdown 報告（圖表用 Mermaid，GitHub 會直接畫出來）
 *   reports/<帳號>_<日期>.json   完整分析結果
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { analyze, cleanPosts, parseThreadsInput, type AnalysisResult, type CleanPost, type Post } from '@app/shared';
import { scrapeProfile } from './scrape/playwright.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const args = process.argv.slice(2);
const username = parseThreadsInput(args.find((a) => !a.startsWith('--')) ?? '');
const fromIdx = args.indexOf('--from');
if (!username) {
  console.error('用法：npm run report -w worker -- <帳號或網址> [--from data/xxx.json]');
  process.exit(1);
}

let raw: Post[];
let meta: { username: string; fetchedAt: string; source: string; stoppedBy?: string; loggedIn?: boolean };
let date: string;
if (fromIdx >= 0) {
  const file = resolve(ROOT, args[fromIdx + 1]);
  const saved = JSON.parse(await readFile(file, 'utf8'));
  raw = saved.posts;
  meta = saved.meta;
  date = meta.fetchedAt.slice(0, 10);
  console.log(`讀取 ${file}：${raw.length} 篇`);
} else {
  console.log(`爬取 @${username}…（每篇要打開貼文頁拿曝光數，約 3–4 分鐘）`);
  const r = await scrapeProfile(username);
  raw = r.posts;
  const fetchedAt = new Date().toISOString();
  meta = { username, fetchedAt, source: 'playwright', stoppedBy: r.stoppedBy, loggedIn: r.loggedIn };
  date = new Date(fetchedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
  await mkdir(resolve(ROOT, 'data'), { recursive: true });
  const dataFile = resolve(ROOT, 'data', `${username}_${date}.json`);
  await writeFile(dataFile, JSON.stringify({ meta, posts: raw }, null, 2));
  console.log(`已存 ${dataFile}：${raw.length} 篇，停止原因 ${r.stoppedBy}`);
}

const { posts } = cleanPosts(raw);
const result = analyze(raw);
await mkdir(resolve(ROOT, 'reports'), { recursive: true });
const base = resolve(ROOT, 'reports', `${username}_${date}`);
await writeFile(`${base}.json`, JSON.stringify({ meta, result }, null, 2));
await writeFile(`${base}.md`, toMarkdown(username, meta, result, posts));
console.log(`已輸出 ${base}.md 與 ${base}.json`);

function toMarkdown(user: string, m: typeof meta, r: AnalysisResult, ps: CleanPost[]): string {
  const ov = r.overview;
  const pct = (x: number | null, d = 2) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
  const cut = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s).replace(/\s+/g, ' ').replace(/\|/g, '｜');
  const bars = (title: string, labels: string[], values: number[], yLabel: string) => [
    '```mermaid',
    'xychart-beta',
    `    title "${title}"`,
    `    x-axis [${labels.map((l) => `"${l}"`).join(', ')}]`,
    `    y-axis "${yLabel}" 0 --> ${Math.max(1, ...values)}`,
    `    bar [${values.join(', ')}]`,
    '```',
  ].join('\n');
  const td = r.timeDist;
  const L: string[] = [];
  L.push(`# @${user} Threads 貼文分析報告`, '');
  L.push(`- 資料來源：${m.source}（${m.loggedIn ? '副帳號登入' : '未登入'}爬取，停止原因：${m.stoppedBy ?? '—'}）`);
  L.push(`- 抓取時間：${m.fetchedAt}`);
  L.push(`- 貼文期間：${ov.dateFrom} 至 ${ov.dateTo}（Asia/Taipei）`);
  L.push(`- 清理：原始 ${r.cleaning.inputCount} 筆，去重 ${r.cleaning.duplicatesRemoved} 筆；缺時間 ${r.cleaning.missing.postedAt}、缺曝光 ${r.cleaning.missing.views}、缺內文 ${r.cleaning.missing.text}`, '');
  L.push('## 總覽指標', '', '| 指標 | 數值 |', '|---|---:|');
  for (const [k, v] of [
    ['貼文數', ov.postCount], ['平均讚', ov.avgLikes], ['平均回覆', ov.avgReplies], ['平均轉發', ov.avgReposts],
    ['平均引用', ov.avgQuotes], ['平均分享', ov.avgShares], ['平均曝光', ov.avgViews ?? '—'],
    ['平均總互動', ov.avgInteractions], ['總互動中位數', ov.medianInteractions], ['整體互動率', pct(ov.overallRate)], ['曝光數覆蓋', pct(ov.viewsCoverage, 0)],
  ] as const) L.push(`| ${k} | ${v} |`);
  L.push('', '> 總互動 = 讚 + 回覆 + 轉發 + 引用 + 分享；互動率 = 總互動 ÷ 曝光數。', '');
  L.push('## 內容策略觀察', '');
  r.observations.forEach((o, i) => L.push(`${i + 1}. **${o.title}**：${o.detail}`, `   - 依據：${o.evidence}`));
  L.push('', `## Top 5 貼文（依${r.summary.rankedBy === 'rate' ? '互動率' : '總互動'}）`, '');
  if (r.summary.rateMinViews != null) L.push(`> 只排曝光數 ≥ ${r.summary.rateMinViews} 的貼文（全體第 25 百分位），避免剛發、曝光很少的貼文因分母小而排在前面。`, '');
  L.push('| # | 內容 | 發文時間 | 讚 | 回覆 | 總互動 | 曝光 | 互動率 |', '|---|---|---|---:|---:|---:|---:|---:|');
  r.top5.forEach((p, i) => L.push(`| ${i + 1} | [${cut(p.text, 40)}](${p.url}) | ${p.postedAtLocal} | ${p.likes} | ${p.replies} | ${p.interactions} | ${p.views ?? '—'} | ${pct(p.rate)} |`));
  L.push('', '## 發文時間分布', '');
  L.push(`最常發文：${td.busiestWeekday?.label}、${td.busiestHour?.key} 點；平均互動最高（至少 2 篇）：${td.bestWeekday?.label ?? '—'}、${td.bestHour?.key ?? '—'} 點。`, '');
  L.push(bars('星期幾發文篇數', td.byWeekday.map((b) => b.label), td.byWeekday.map((b) => b.count), '篇'), '');
  L.push(bars('各時段發文篇數（台灣時間）', td.byHour.map((b) => String(b.key)), td.byHour.map((b) => b.count), '篇'), '');
  L.push('| 星期 | 篇數 | 平均總互動 |', '|---|---:|---:|', ...td.byWeekday.map((b) => `| ${b.label} | ${b.count} | ${b.avgInteractions} |`), '');
  L.push('## 文字長度與互動', '');
  L.push(`Spearman：字數 × 總互動 ${r.lengthRel.rhoInteractions ?? '—'}；字數 × 互動率 ${r.lengthRel.rhoRate ?? '—'}。`, '');
  L.push(bars('各篇幅平均總互動', r.lengthRel.buckets.map((b) => `${b.label} ${b.range}`), r.lengthRel.buckets.map((b) => b.avgInteractions), '平均總互動'), '');
  L.push('| 篇幅 | 篇數 | 平均總互動 | 平均互動率 |', '|---|---:|---:|---:|', ...r.lengthRel.buckets.map((b) => `| ${b.label}（${b.range}） | ${b.count} | ${b.avgInteractions} | ${pct(b.avgRate)} |`), '');
  L.push('## 貼文類型', '', '| 類型 | 篇數 | 占比 | 平均總互動 | 平均互動率 |', '|---|---:|---:|---:|---:|');
  r.postTypes.forEach((t) => L.push(`| ${t.type} | ${t.count} | ${pct(t.share, 0)} | ${t.avgInteractions} | ${pct(t.avgRate)} |`));
  L.push('', '## 關鍵字與 Hashtag', '');
  L.push(`- 關鍵字（TF-IDF，出現 2 篇以上）：${r.keywords.map((k) => k.term).join('、') || '—'}`);
  L.push(`- Hashtag：${r.hashtags.map((h) => `#${h.tag}（${h.count}）`).join('、') || '這段期間沒有使用'}`, '');
  L.push('## 分群與 NLP 分析', '');
  L.push('分群：讚數與回覆數各取百分位排名後平均，三等分。每篇代表貼文都用同一套文本特徵分析，方向由全體貼文的 Spearman 相關決定。', '');
  for (const g of r.groups) {
    L.push(`### ${{ high: '高互動群', mid: '中互動群', low: '低互動群' }[g.name]}（${g.count} 篇）：${g.label}`, '', g.summary, '');
    for (const s of g.samples) {
      L.push(`- [${cut(s.excerpt, 30)}](${s.url})（讚 ${s.likes}、回覆 ${s.replies}）`);
      s.reasons.forEach((x) => L.push(`  - ${x}`));
    }
    L.push('');
  }
  L.push('## 全部貼文（清理後）', '', '| 時間 | 內容 | 類型 | 字數 | 讚 | 回覆 | 轉發 | 引用 | 分享 | 曝光 | 互動率 |', '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  ps.forEach((p) => L.push(`| ${p.postedAtLocal} | [${cut(p.text, 24)}](${p.url}) | ${p.postType} | ${p.charCount} | ${p.likes} | ${p.replies} | ${p.reposts} | ${p.quotes} | ${p.shares} | ${p.views ?? '—'} | ${pct(p.rate)} |`));
  L.push('');
  return L.join('\n');
}
