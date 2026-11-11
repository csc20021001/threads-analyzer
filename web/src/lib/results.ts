import type { AnalysisResult, CleanPost } from '@app/shared';

/** 資料庫的 snake_case 欄位轉成前端用的型別 */
export function toResult(row: Record<string, any>): AnalysisResult {
  return {
    summary: row.summary,
    cleaning: row.cleaning,
    overview: row.overview,
    top5: row.top5,
    timeDist: row.time_dist,
    lengthRel: row.length_rel,
    postTypes: row.post_types,
    hashtags: row.hashtags,
    correlations: row.correlations,
    keywords: row.keywords,
    clusters: row.clusters,
    groups: row.groups,
    observations: row.observations,
  };
}

export interface LlmView {
  model: string;
  items: { title: string; detail: string; basis: string }[];
}

export function toLlm(row: Record<string, any>): LlmView | null {
  return Array.isArray(row.llm_suggestions) && row.llm_suggestions.length
    ? { model: row.llm_model ?? '', items: row.llm_suggestions }
    : null;
}

export function toPost(r: Record<string, any>): CleanPost {
  return {
    postId: r.post_id,
    url: r.url,
    text: r.text,
    postedAt: r.posted_at,
    postedAtLocal: r.posted_at_local,
    weekday: r.weekday,
    hour: r.hour,
    likes: r.likes,
    replies: r.replies,
    reposts: r.reposts,
    quotes: r.quotes,
    shares: r.shares,
    views: r.views,
    charCount: r.char_count,
    hashtags: r.hashtags ?? [],
    mentionList: r.mentions ?? [],
    urlCount: r.url_count,
    postType: r.post_type,
    interactions: r.interactions,
    rate: r.engagement_rate,
  };
}

export const POST_COLUMNS =
  'post_id, url, text, posted_at, posted_at_local, weekday, hour, likes, replies, reposts, quotes, shares, views, char_count, hashtags, mentions, url_count, post_type, interactions, engagement_rate';
