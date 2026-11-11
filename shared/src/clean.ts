import type { CleanPost, CleanReport, Post, PostType } from './types.ts';

export const TIMEZONE = 'Asia/Taipei';

const HASHTAG_RE = /(?:^|[^\p{L}\p{N}_&])#([\p{L}\p{N}_]+)/gu;
const MENTION_RE = /(?:^|[^\p{L}\p{N}_.@])@([A-Za-z0-9._]{1,30})/gu;
const URL_RE = /https?:\/\/[^\s<>"'，。！？、）)]+/g;

const parts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** UTC ISO 時間轉成台灣時間的各欄位 */
export function toLocal(iso: string | null) {
  if (!iso) return { postedAtLocal: null, weekday: null, hour: null };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { postedAtLocal: null, weekday: null, hour: null };
  const p = Object.fromEntries(parts.formatToParts(d).map((x) => [x.type, x.value]));
  return {
    postedAtLocal: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`,
    weekday: WEEKDAY[p.weekday] ?? null,
    hour: Number(p.hour),
  };
}

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.toLowerCase()))];

export function textFeatures(text: string, extraLinks: string[] = [], extraMentions: string[] = []) {
  const hashtags = uniq([...text.matchAll(HASHTAG_RE)].map((m) => m[1]));
  const mentionList = uniq([...[...text.matchAll(MENTION_RE)].map((m) => m[1]), ...extraMentions]);
  const urls = new Set([...(text.match(URL_RE) ?? []), ...extraLinks]);
  return { charCount: [...text.replace(/\s/g, '')].length, hashtags, mentionList, urlCount: urls.size };
}

export function classify(f: { hashtags: string[]; mentionList: string[]; urlCount: number }): PostType {
  const kinds: PostType[] = [];
  if (f.urlCount > 0) kinds.push('含連結');
  if (f.hashtags.length > 0) kinds.push('含 hashtag');
  if (f.mentionList.length > 0) kinds.push('含 mention');
  if (kinds.length === 0) return '純文字';
  return kinds.length === 1 ? kinds[0] : '混合';
}

/** 總互動 = 讚 + 回覆 + 轉發 + 引用 + 分享，與題目附的試算表「總互動」欄算法一致 */
export const interactions = (p: Post) => p.likes + p.replies + p.reposts + p.quotes + (p.shares ?? 0);

/**
 * 資料清理：去重（同 postId 保留數字較大的一筆）、缺失欄位補預設值並計數、時間轉台灣時區、加上文字特徵。
 * 數字欄位缺失一律視為 0；曝光數缺失保留 null，不參與互動率計算。
 */
export function cleanPosts(raw: Post[]): { posts: CleanPost[]; report: CleanReport } {
  const byId = new Map<string, Post>();
  for (const p of raw) {
    const prev = byId.get(p.postId);
    if (!prev || interactions(p) > interactions(prev)) byId.set(p.postId, p);
  }
  const missing = { postedAt: 0, views: 0, text: 0, url: 0 };
  const posts = [...byId.values()].map<CleanPost>((p) => {
    const text = (p.text ?? '').trim();
    if (!p.postedAt) missing.postedAt++;
    if (p.views == null) missing.views++;
    if (!text) missing.text++;
    if (!p.url) missing.url++;
    const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : 0);
    const base: Post = {
      ...p, text,
      likes: n(p.likes), replies: n(p.replies), reposts: n(p.reposts), quotes: n(p.quotes), shares: n(p.shares),
      views: typeof p.views === 'number' && p.views >= 0 ? p.views : null,
    };
    const f = textFeatures(text, p.links, p.mentions);
    const i = interactions(base);
    return {
      ...base, ...toLocal(p.postedAt), ...f,
      postType: classify(f),
      interactions: i,
      rate: base.views && base.views > 0 ? i / base.views : null,
    };
  });
  posts.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  return { posts, report: { inputCount: raw.length, duplicatesRemoved: raw.length - byId.size, missing } };
}
