import { cleanPosts } from './clean.ts';
import { ranks, spearman } from './stats.ts';
import { analyzeGroups, buildObservations } from './nlp.ts';
import type {
  AnalysisResult, CleanPost, Cluster, ClusterName, Correlation, Keyword, LengthRel, Overview,
  Post, PostType, TagCount, TimeBucket, TimeDist, TypeStat,
} from './types.ts';

export { interactions } from './clean.ts';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (x: number, d = 2) => Number(x.toFixed(d));
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 一半以上有曝光數就用互動率排；否則退回互動量，報告上要標示 */
export function rank(posts: CleanPost[]): { ranked: CleanPost[]; rankedBy: 'rate' | 'interactions' } {
  const withViews = posts.filter((p) => p.rate != null).length;
  const rankedBy = withViews > 0 && withViews * 2 >= posts.length ? 'rate' : 'interactions';
  const ranked = [...posts].sort((a, b) =>
    rankedBy === 'rate'
      ? (b.rate ?? -1) - (a.rate ?? -1) || b.interactions - a.interactions
      : b.interactions - a.interactions,
  );
  return { ranked, rankedBy };
}

export { spearman } from './stats.ts';

function correlations(posts: CleanPost[], useRate: boolean): Correlation[] {
  const target = (p: CleanPost) => (useRate ? p.rate ?? 0 : p.interactions);
  const features: Record<Correlation['metric'], (p: CleanPost) => number | null> = {
    length: (p) => p.charCount,
    hour: (p) => p.hour,
    hasQuestion: (p) => (/[?？]/.test(p.text) ? 1 : 0),
    hasLink: (p) => (p.urlCount > 0 ? 1 : 0),
  };
  return (Object.keys(features) as Correlation['metric'][]).map((metric) => {
    const pairs = posts
      .map((p) => [features[metric](p), target(p)] as const)
      .filter((pair): pair is readonly [number, number] => pair[0] != null);
    const rho = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
    return { metric, rho: rho == null ? null : round(rho), n: pairs.length };
  });
}

export function overview(posts: CleanPost[]): Overview {
  const withViews = posts.filter((p) => p.views != null);
  const totalViews = withViews.reduce((a, p) => a + (p.views ?? 0), 0);
  const dated = posts.map((p) => p.postedAtLocal).filter((x): x is string => !!x).sort();
  return {
    postCount: posts.length,
    dateFrom: dated[0] ?? null,
    dateTo: dated.at(-1) ?? null,
    avgLikes: round(mean(posts.map((p) => p.likes)), 1),
    avgReplies: round(mean(posts.map((p) => p.replies)), 1),
    avgReposts: round(mean(posts.map((p) => p.reposts)), 1),
    avgQuotes: round(mean(posts.map((p) => p.quotes)), 1),
    avgShares: round(mean(posts.map((p) => p.shares)), 1),
    avgViews: withViews.length ? round(totalViews / withViews.length, 0) : null,
    avgInteractions: round(mean(posts.map((p) => p.interactions)), 1),
    medianInteractions: median(posts.map((p) => p.interactions)),
    overallRate: totalViews > 0 ? round(withViews.reduce((a, p) => a + p.interactions, 0) / totalViews, 4) : null,
    viewsCoverage: posts.length ? round(withViews.length / posts.length, 4) : 0,
  };
}

const WEEKDAY_LABEL = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export function timeDistribution(posts: CleanPost[]): TimeDist {
  const bucket = (key: number, label: string, ps: CleanPost[]): TimeBucket => ({
    key, label, count: ps.length, avgInteractions: round(mean(ps.map((p) => p.interactions)), 1),
  });
  // 週一排第一，符合台灣習慣
  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((d) => bucket(d, WEEKDAY_LABEL[d], posts.filter((p) => p.weekday === d)));
  const byHour = Array.from({ length: 24 }, (_, h) => bucket(h, `${h} 點`, posts.filter((p) => p.hour === h)));
  const busiest = (xs: TimeBucket[]) => xs.reduce<TimeBucket | null>((a, b) => (b.count > (a?.count ?? 0) ? b : a), null);
  const best = (xs: TimeBucket[]) =>
    xs.filter((b) => b.count >= 2).reduce<TimeBucket | null>((a, b) => (b.avgInteractions > (a?.avgInteractions ?? -1) ? b : a), null);
  return {
    byWeekday, byHour,
    busiestWeekday: busiest(byWeekday), busiestHour: busiest(byHour),
    bestWeekday: best(byWeekday), bestHour: best(byHour),
  };
}

export function lengthRelation(posts: CleanPost[]): LengthRel {
  const defs = [
    { label: '短文', range: '100 字以下', test: (n: number) => n <= 100 },
    { label: '中篇', range: '101–250 字', test: (n: number) => n > 100 && n <= 250 },
    { label: '長文', range: '250 字以上', test: (n: number) => n > 250 },
  ];
  const rated = posts.filter((p) => p.rate != null);
  const rhoI = spearman(posts.map((p) => p.charCount), posts.map((p) => p.interactions));
  const rhoR = spearman(rated.map((p) => p.charCount), rated.map((p) => p.rate!));
  return {
    rhoInteractions: rhoI == null ? null : round(rhoI),
    rhoRate: rhoR == null ? null : round(rhoR),
    buckets: defs.map((d) => {
      const ps = posts.filter((p) => d.test(p.charCount));
      const rs = ps.filter((p) => p.rate != null).map((p) => p.rate!);
      return {
        label: d.label, range: d.range, count: ps.length,
        avgInteractions: round(mean(ps.map((p) => p.interactions)), 1),
        avgRate: rs.length ? round(mean(rs), 4) : null,
      };
    }),
    points: posts.map((p) => ({ postId: p.postId, charCount: p.charCount, interactions: p.interactions })),
  };
}

export function postTypeStats(posts: CleanPost[]): TypeStat[] {
  const order: PostType[] = ['純文字', '含連結', '含 hashtag', '含 mention', '混合'];
  return order.map((type) => {
    const ps = posts.filter((p) => p.postType === type);
    const rs = ps.filter((p) => p.rate != null).map((p) => p.rate!);
    return {
      type, count: ps.length,
      share: posts.length ? round(ps.length / posts.length, 4) : 0,
      avgInteractions: round(mean(ps.map((p) => p.interactions)), 1),
      avgRate: rs.length ? round(mean(rs), 4) : null,
    };
  });
}

export function hashtagCounts(posts: CleanPost[]): TagCount[] {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of p.hashtags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const STOP = new Set([
  '的', '了', '是', '我', '你', '他', '她', '在', '有', '和', '就', '都', '也', '很', '這', '那', '嗎', '吧', '啊', '呢',
  '一個', '我們', '你們', '他們', '自己', '什麼', '沒有', '就是', '因為', '所以', '但是', '然後', '還是', '已經', '可以',
  '這樣', '那個', '這個', '一下', '一直', '不是', '知道', '真的', '其實', '還有', '如果', '時候', '現在', '一樣', '只是',
  '我把', '你的', '我的', '他的', '她的', '不要', '一次', '一點', '有人', '不會', '怎麼', '為什麼', '我們的', '就好', '一起', '最後', '說要',
  'the', 'a', 'to', 'and', 'of', 'is', 'in', 'i', 'you', 'it', 'on', 'for', 'with', 'that', 'this', 'my', 'we', 'be',
]);
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'word' });

export function tokenize(text: string): string[] {
  const out: string[] = [];
  const cleaned = text.replace(/https?:\/\/\S+/g, ' ').replace(/[#@][\p{L}\p{N}_.]+/gu, ' ');
  for (const s of segmenter.segment(cleaned)) {
    const w = s.segment.toLowerCase();
    if (s.isWordLike && [...w].length > 1 && !STOP.has(w) && !/^\d+$/.test(w)) out.push(w);
  }
  return out;
}

export function tfidfKeywords(texts: string[], topK = 20): Keyword[] {
  const docs = texts.map(tokenize).filter((d) => d.length);
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
    .filter(([t]) => (df.get(t) ?? 0) >= 2 || docs.length < 5) // 只出現在一篇的詞不算「常見」
    .map(([term, s]) => ({ term, score: round(s, 4) }))
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
    const k = Math.min(Math.max(3, Math.min(samplesPerCluster, 5)), ids.length);
    const step = ids.length / Math.max(k, 1);
    const samples = Array.from({ length: k }, (_, i) => ids[Math.floor(i * step)]);
    return { name, label: keywords.join('・') || '（無明顯主題）', keywords, postIds: ids, samples };
  });
}

/** 完整流程：清理 → 指標 → 分群 → 分群 NLP 分析 → 內容策略觀察 */
export function analyze(raw: Post[]): AnalysisResult {
  const { posts, report } = cleanPosts(raw);
  const { ranked, rankedBy } = rank(posts);
  const clusters = clusterPosts(posts);
  const ov = overview(posts);
  const td = timeDistribution(posts);
  const lr = lengthRelation(posts);
  const types = postTypeStats(posts);
  const groups = analyzeGroups(posts, clusters);
  return {
    summary: { postCount: posts.length, viewsCoverage: ov.viewsCoverage, rankedBy },
    cleaning: report,
    overview: ov,
    top5: ranked.slice(0, 5),
    timeDist: td,
    lengthRel: lr,
    postTypes: types,
    hashtags: hashtagCounts(posts),
    correlations: correlations(posts, rankedBy === 'rate'),
    keywords: tfidfKeywords(posts.map((p) => p.text)),
    clusters,
    groups,
    observations: buildObservations({ posts, overview: ov, timeDist: td, lengthRel: lr, postTypes: types, groups }),
  };
}
