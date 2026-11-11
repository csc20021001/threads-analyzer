import type {
  AnalysisResult, Cluster, ClusterName, Correlation, Keyword, Post, RankedPost,
} from './types.ts';

export const interactions = (p: Post) => p.likes + p.replies + p.reposts + p.quotes;

export function rank(posts: Post[]): { ranked: RankedPost[]; rankedBy: 'rate' | 'interactions' } {
  const ranked = posts.map<RankedPost>((p) => {
    const i = interactions(p);
    return { ...p, interactions: i, rate: p.views && p.views > 0 ? i / p.views : null };
  });
  // 一半以上有曝光數才用互動率排；否則退回互動量，報告上要標示
  const withViews = ranked.filter((p) => p.rate != null).length;
  const rankedBy = withViews * 2 >= ranked.length && withViews > 0 ? 'rate' : 'interactions';
  ranked.sort((a, b) =>
    rankedBy === 'rate'
      ? (b.rate ?? -1) - (a.rate ?? -1) || b.interactions - a.interactions
      : b.interactions - a.interactions,
  );
  return { ranked, rankedBy };
}

/** 平均名次（處理同分），回傳 1-based rank */
function ranks(xs: number[]): number[] {
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

export function spearman(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;
  const rx = ranks(x);
  const ry = ranks(y);
  const mean = (n + 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mean, b = ry[i] - mean;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx === 0 || dy === 0 ? null : num / Math.sqrt(dx * dy);
}

function correlations(posts: RankedPost[], useRate: boolean): Correlation[] {
  const target = posts.map((p) => (useRate ? p.rate ?? 0 : p.interactions));
  const features: Record<Correlation['metric'], (p: Post) => number | null> = {
    length: (p) => [...p.text].length,
    hour: (p) => (p.postedAt ? (new Date(p.postedAt).getUTCHours() + 8) % 24 : null), // 台灣時間
    hasQuestion: (p) => (/[?？]/.test(p.text) ? 1 : 0),
    hasLink: (p) => (/https?:\/\//.test(p.text) ? 1 : 0),
  };
  return (Object.keys(features) as Correlation['metric'][]).map((metric) => {
    const pairs = posts
      .map((p, i) => [features[metric](p), target[i]] as const)
      .filter((pair): pair is readonly [number, number] => pair[0] != null);
    return {
      metric,
      rho: spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1])),
      n: pairs.length,
    };
  });
}

const STOP = new Set(['的', '了', '是', '我', '你', '在', '有', '和', '就', '都', '也', '很', '這', '那', '嗎', '吧', '啊', 'the', 'a', 'to', 'and', 'of', 'is', 'in', 'i', 'you']);
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const s of segmenter.segment(text.replace(/https?:\/\/\S+/g, ' '))) {
    const w = s.segment.toLowerCase();
    if (s.isWordLike && w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w)) out.push(w);
  }
  return out;
}

export function tfidfKeywords(texts: string[], topK = 20): Keyword[] {
  const docs = texts.map(tokenize);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const score = new Map<string, number>();
  for (const d of docs) {
    const tf = new Map<string, number>();
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const [t, c] of tf) {
      const idf = Math.log((1 + docs.length) / (1 + df.get(t)!)) + 1;
      score.set(t, (score.get(t) ?? 0) + (c / d.length) * idf);
    }
  }
  return [...score]
    .map(([term, s]) => ({ term, score: Number(s.toFixed(4)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function percentileRanks(xs: number[]): number[] {
  const r = ranks(xs);
  return r.map((v) => (xs.length > 1 ? (v - 1) / (xs.length - 1) : 0.5));
}

/**
 * 找出最能代表某一群的詞：這群裡出現的貼文比例，減掉其他群出現的比例。
 * 只算至少出現在 2 篇的詞，避免單篇的偶然用詞被選上（群太小時放寬到 1 篇）。
 */
export function distinctiveTerms(inGroup: string[], outGroup: string[], topK = 3): string[] {
  const docFreq = (texts: string[]) => {
    const df = new Map<string, number>();
    for (const t of texts) for (const w of new Set(tokenize(t))) df.set(w, (df.get(w) ?? 0) + 1);
    return df;
  };
  const dfIn = docFreq(inGroup);
  const dfOut = docFreq(outGroup);
  const minDocs = inGroup.length >= 4 ? 2 : 1;
  return [...dfIn]
    .filter(([, c]) => c >= minDocs)
    .map(([w, c]) => ({ w, s: c / inGroup.length - (dfOut.get(w) ?? 0) / Math.max(outGroup.length, 1), c }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.c - a.c || a.w.localeCompare(b.w))
    .slice(0, topK)
    .map((x) => x.w);
}

/** 按讚、回覆各取百分位排名後平均，切成高／中／低三群，用關鍵字取名，每群等距抽 3–5 篇 */
export function clusterPosts(posts: Post[], samplesPerCluster = 4): Cluster[] {
  const pl = percentileRanks(posts.map((p) => p.likes));
  const pr = percentileRanks(posts.map((p) => p.replies));
  const scored = posts
    .map((p, i) => ({ id: p.postId, text: p.text, s: (pl[i] + pr[i]) / 2 }))
    .sort((a, b) => b.s - a.s);

  const names: ClusterName[] = ['high', 'mid', 'low'];
  const size = Math.ceil(scored.length / 3);
  return names.map((name, g) => {
    const members = scored.slice(g * size, (g + 1) * size);
    const others = scored.filter((x) => !members.includes(x));
    const ids = members.map((x) => x.id);
    const keywords = distinctiveTerms(members.map((x) => x.text), others.map((x) => x.text));
    const k = Math.min(samplesPerCluster, ids.length);
    const step = ids.length / Math.max(k, 1);
    const samples = Array.from({ length: k }, (_, i) => ids[Math.floor(i * step)]);
    return { name, label: keywords.join('・') || '（無明顯主題）', keywords, postIds: ids, samples };
  });
}

export function analyze(posts: Post[]): AnalysisResult {
  const { ranked, rankedBy } = rank(posts);
  return {
    summary: {
      postCount: posts.length,
      viewsCoverage: posts.length ? posts.filter((p) => p.views != null).length / posts.length : 0,
      rankedBy,
    },
    top5: ranked.slice(0, 5),
    correlations: correlations(ranked, rankedBy === 'rate'),
    keywords: tfidfKeywords(posts.map((p) => p.text)),
    clusters: clusterPosts(posts),
  };
}
