/**
 * 數據分析題：用題目附的試算表（16 篇 @emoless_com 貼文）分三群，並用同一套 NLP 方法分析成功與失敗原因。
 * - 數字（讚、回覆、轉發、引用、總互動）以試算表為準；引用欄即 Threads 的分享（紙飛機）數。
 * - 試算表的「貼文摘要」有截斷，內文改用 sheet-fetch.ts 從貼文頁取得的全文。
 * - 分群與 NLP 和網站報告用的是同一套程式（clusterPosts、analyzeGroups）。
 * 用法：npx tsx src/sheet-analysis.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeGroups, cleanPosts, clusterPosts, textProfile, type Post } from '@app/shared';

const USER = 'emoless_com';
const input = JSON.parse(readFileSync('../data/sheet_emoless_com_input.json', 'utf8'));
const full: Record<string, { text: string; postedAt: string | null }> =
  JSON.parse(readFileSync('../data/sheet_emoless_com_fulltext.json', 'utf8'));

// 試算表的發布時間是 UTC 的序列值（1899-12-30 起算），和貼文頁的 taken_at 一致
const serialToIso = (s: number) => new Date(Math.round((s - 25569) * 86400) * 1000).toISOString();

const raw: Post[] = input.rows.map((r: any) => ({
  postId: r.code,
  url: `https://www.threads.com/@${USER}/post/${r.code}`,
  text: full[r.code]?.text ?? '',
  postedAt: serialToIso(r.serial),
  likes: r.likes,
  replies: r.replies,
  reposts: r.reposts,
  quotes: 0,
  shares: r.quotes,
  views: null,
}));

// 檢查：試算表時間與貼文頁時間差距、總互動與試算表一致
for (const r of input.rows) {
  const page = full[r.code]?.postedAt;
  const diff = page ? Math.abs(Date.parse(page) - Date.parse(serialToIso(r.serial))) / 1000 : null;
  if (diff == null || diff > 120) throw new Error(`${r.code} 時間對不上：${diff}s`);
}

const { posts } = cleanPosts(raw);
for (const p of posts) {
  const row = input.rows.find((r: any) => r.code === p.postId);
  if (p.interactions !== row.total) throw new Error(`${p.postId} 總互動 ${p.interactions} ≠ 試算表 ${row.total}`);
}

/** 主題：關鍵詞計數取最多的一類（同分取列表前面的） */
const TOPICS: [string, RegExp][] = [
  ['感情', /交往|分手|告白|單身|劈腿|在一起|異地|結婚|約定|喜歡的人|愛的人|沒回|已讀|視訊|生日/g],
  ['家庭', /媽|爸|長輩|家人|父母/g],
  ['職場', /主管|加薪|組長|企劃|同事|教甄|代課|工作|上台|改善方案|發表會|新人/g],
  ['理財', /存款|記帳|卡費|學貸|頭期款|權狀|貸款|本票|餘額|薪水/g],
  ['自我與人際', /自己|評價|人生|開口|懂事|照顧|沉默/g],
];
function topicOf(text: string) {
  const scores = TOPICS.map(([name, re]) => ({ name, n: (text.match(re) ?? []).length }));
  const best = scores.reduce((a, b) => (b.n > a.n ? b : a));
  return best.n ? best.name : '其他';
}

/** 文型：名言引言／經驗＋反駁觀點（帳號常用的「我不同意／我不建議」句型）／故事敘事／觀點短文 */
function formOf(text: string) {
  const f = textProfile(text);
  if (f.quoteStyle) return '名言引言';
  if (/我不同意|我不建議/.test(text)) return '經驗＋反駁觀點';
  if (f.narrative >= 2 || f.dialogue >= 2) return '故事敘事';
  return '觀點短文';
}

const clusters = clusterPosts(posts, 5);
const groups = analyzeGroups(posts, clusters);
const groupOf = new Map<string, string>();
const NAME = { high: '高互動群', mid: '中互動群', low: '低互動群' } as const;
for (const c of clusters) for (const id of c.postIds) groupOf.set(id, NAME[c.name]);
const sampleOf = new Map(groups.flatMap((g) => g.samples.map((s) => [s.postId, s] as const)));

const twTime = (iso: string) => new Date(Date.parse(iso) + 8 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
const excerpt = (t: string) => { const s = t.replace(/\s+/g, ' ').trim(); return [...s].slice(0, 40).join('') + ([...s].length > 40 ? '…' : ''); };

const ordered = clusters.flatMap((c) => c.postIds.map((id) => posts.find((p) => p.postId === id)!));
const rows = ordered.map((p) => {
  const f = textProfile(p.text);
  const s = sampleOf.get(p.postId);
  return {
    群組: groupOf.get(p.postId)!,
    代表貼文: s ? '是' : '',
    post_id: p.postId,
    '發布時間（台灣）': twTime(p.postedAt!),
    貼文開頭: excerpt(p.text),
    主題: topicOf(p.text),
    文型: formOf(p.text),
    按讚: p.likes,
    回覆: p.replies,
    轉發: p.reposts,
    '引用（分享）': p.shares,
    總互動: p.interactions,
    字數: f.charCount,
    結尾提問: f.endsWithQuestion ? '是' : '否',
    具體數字: f.numbers,
    對話: f.dialogue,
    敘事時間標記: f.narrative,
    情緒詞: f.emotion,
    '成功／失敗原因（同一套 NLP 規則）': s ? s.reasons.join('；') : '',
    貼文連結: p.url,
  };
});

const csvCell = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const headers = Object.keys(rows[0]);
writeFileSync('../reports/sheet_emoless_com_groups.csv',
  '﻿' + [headers.join(','), ...rows.map((r) => headers.map((h) => csvCell((r as any)[h])).join(','))].join('\n') + '\n');

const md: string[] = [
  '# 數據分析題：@emoless_com 試算表 16 篇貼文分三群與 NLP 分析',
  '',
  '資料：題目附的試算表（工作表1，16 篇，皆為 is_reply = FALSE）。數字以試算表為準；「引用」欄即 Threads 的分享（紙飛機）數。',
  '試算表「貼文摘要」部分被截斷，內文改用貼文頁全文；試算表發布時間為 UTC，下表換成台灣時間。',
  '',
  '## 方法',
  '',
  '1. 分群：按讚、回覆各自在 16 篇中取百分位排名（同值取平均名次），兩者平均為互動分數，依分數排序三等分（6／6／4 篇）。',
  '2. 每群取 3–5 篇代表貼文（群內依分數等距抽樣），三群都用同一套 9 個文本特徵：字數、句數、第一人稱密度、結尾提問、具體數字、對話、敘事時間標記、引言型、情緒詞。',
  '3. 以 16 篇計算各特徵與總互動的 Spearman 相關，決定「加分」或「扣分」方向；每篇代表貼文取偏離平均最多的特徵寫成原因。',
  '4. 主題、文型以固定關鍵詞與特徵規則判斷，可重現；規則寫在 worker/src/sheet-analysis.ts。',
  '',
];
for (const g of groups) {
  md.push(`## ${NAME[g.name]}（${g.count} 篇，平均讚 ${g.avgLikes}、平均回覆 ${g.avgReplies}）`, '', g.summary, '');
  md.push('| post_id | 主題 | 文型 | 讚 | 回覆 | 總互動 | 原因 |', '| --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const s of g.samples) {
    const r = rows.find((x) => x.post_id === s.postId)!;
    md.push(`| [${s.postId}](${s.url}) | ${r.主題} | ${r.文型} | ${s.likes} | ${s.replies} | ${s.interactions} | ${s.reasons.join('；')} |`);
  }
  md.push('');
}
// 三群的主題、文型分布與各文型互動中位數，作為結論的依據
const median = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const dist = (key: '主題' | '文型', group: string) => {
  const c = new Map<string, number>();
  for (const r of rows.filter((x) => x.群組 === group)) c.set(r[key], (c.get(r[key]) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join('、');
};
md.push('## 三群的主題與文型分布', '', '| 群組 | 主題 | 文型 |', '| --- | --- | --- |');
for (const g of Object.values(NAME)) md.push(`| ${g} | ${dist('主題', g)} | ${dist('文型', g)} |`);
md.push('', '| 文型 | 篇數 | 總互動中位數 | 讚中位數 | 回覆中位數 | 落在高互動群 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
const forms = [...new Set(rows.map((r) => r.文型))];
const formStats = forms.map((f) => {
  const rs = rows.filter((r) => r.文型 === f);
  return { f, n: rs.length, total: median(rs.map((r) => r.總互動)), likes: median(rs.map((r) => r.按讚)), replies: median(rs.map((r) => r.回覆)), high: rs.filter((r) => r.群組 === '高互動群').length };
}).sort((a, b) => b.total - a.total);
for (const x of formStats) md.push(`| ${x.f} | ${x.n} | ${x.total} | ${x.likes} | ${x.replies} | ${x.high} |`);
const fs = (f: string) => formStats.find((x) => x.f === f)!;
const pf = (g: number, k: string) => groups[g].profile.find((p) => p.key === k)!;
const story = fs('故事敘事'), quote = fs('名言引言'), rebut = fs('經驗＋反駁觀點');
const lowRows = rows.filter((r) => r.群組 === '低互動群');
const rebutHigh = rows.filter((r) => r.文型 === '經驗＋反駁觀點' && r.群組 === '高互動群');
md.push(
  '',
  '## 結論',
  '',
  `1. **成功原因（高互動群）**：${groups[0].count} 篇中 ${rows.filter((r) => r.群組 === '高互動群' && r.文型 === '故事敘事').length} 篇是故事敘事。共同點是具體數字多（群平均 ${pf(0, 'numbers').value} 處，全體 ${pf(0, 'numbers').overall}）、敘事時間標記多（${pf(0, 'narrative').value} 個，全體 ${pf(0, 'narrative').overall}），這兩個特徵也是 16 篇中與總互動相關最高的。故事敘事 ${story.n} 篇的總互動中位數 ${story.total}，高於名言引言（${quote.total}）與經驗＋反駁觀點（${rebut.total}）。`,
  `2. **名言引言只帶讚、不帶討論（中互動群）**：名言引言 ${quote.n} 篇讚中位數 ${quote.likes}，回覆中位數只有 ${quote.replies}，沒有一篇進入高互動群。適合維持曝光，但不會引發留言。`,
  `3. **失敗原因（低互動群）**：低互動群 ${lowRows.length} 篇中 ${lowRows.filter((r) => r.文型 === '經驗＋反駁觀點').length} 篇是「經驗＋反駁觀點」（「我不同意／我不建議…」），這類 ${rebut.n} 篇的總互動中位數只有 ${rebut.total}；也缺少具體數字（低互動群平均 ${pf(2, 'numbers').value} 處）與故事時間線（${pf(2, 'narrative').value} 個）。唯一例外 ${rebutHigh.map((r) => r.post_id).join('、') || '無'} 以具體數字開頭（加薪 2,400、一天多 80 塊），反駁前先給了讀者能算、能比較的細節。`,
  '4. **限制**：只有 16 篇、集中在 4 天內；試算表沒有曝光數，無法排除觸及差異；相關不等於因果，建議用 A/B 發文（同主題分別寫成故事型與反駁型）驗證。',
  '',
);
console.log(formStats);
md.push('## 全部 16 篇', '', '| 群組 | post_id | 台灣時間 | 主題 | 文型 | 讚 | 回覆 | 總互動 | 字數 |', '| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: |');
for (const r of rows) md.push(`| ${r.群組} | ${r.post_id} | ${r['發布時間（台灣）']} | ${r.主題} | ${r.文型} | ${r.按讚} | ${r.回覆} | ${r.總互動} | ${r.字數} |`);
writeFileSync('../reports/sheet_emoless_com_groups.md', md.join('\n') + '\n');
writeFileSync('../reports/sheet_emoless_com_groups.json', JSON.stringify({ clusters, groups, rows }, null, 2) + '\n');

for (const r of rows) console.log(r.群組, r.代表貼文 || '  ', r.post_id, r.主題, r.文型, r.按讚, r.回覆, r.總互動, '|', r.貼文開頭);
for (const g of groups) { console.log('\n#', NAME[g.name], g.summary); for (const s of g.samples) console.log(' ', s.postId, s.reasons.join(' / ')); }
