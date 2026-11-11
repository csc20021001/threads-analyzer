import { parseCount, type Post } from '@app/shared';

/**
 * 從 Threads 網頁回應的 JSON 裡找出貼文。
 *
 * Threads 的內部 GraphQL 結構沒有公開文件、隨時會變，所以這裡不寫死路徑，
 * 而是遞迴走整棵 JSON，找「長得像貼文」的物件（有 like_count 且有 code 或 pk）。
 * 實際欄位名稱要在「爬取可行性實測」那步用 `npm run probe` 存下回應後確認。
 */
export function extractPostsFromJson(json: unknown, username: string): Post[] {
  const out: Post[] = [];
  const seen = new Set<object>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) { node.forEach(walk); return; }

    const o = node as Record<string, any>;
    if ('like_count' in o && (o.code || o.pk || o.id)) {
      const post = toPost(o, username);
      if (post) out.push(post);
    }
    for (const v of Object.values(o)) walk(v);
  };

  walk(json);
  return out;
}

function toPost(o: Record<string, any>, username: string): Post | null {
  const author = o.user?.username;
  if (author && author.toLowerCase() !== username.toLowerCase()) return null; // 排除別人的回覆、轉發來源

  const info = o.text_post_app_info ?? {};
  const code: string | undefined = o.code;
  const takenAt = typeof o.taken_at === 'number' ? new Date(o.taken_at * 1000).toISOString() : null;

  return {
    postId: String(o.pk ?? o.id ?? code),
    url: code ? `https://www.threads.com/@${username}/post/${code}` : null,
    text: o.caption?.text ?? '',
    postedAt: takenAt,
    likes: parseCount(o.like_count) ?? 0,
    replies: parseCount(info.direct_reply_count ?? o.reply_count) ?? 0,
    reposts: parseCount(info.repost_count) ?? 0,
    quotes: parseCount(info.quote_count) ?? 0,
    views: parseCount(o.view_count ?? o.play_count ?? info.impression_count ?? null),
  };
}
