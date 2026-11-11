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

/**
 * 單篇貼文頁的資料裡，瀏覽數放在 data.media.text_post_app_info.impression_count，
 * 個人首頁的貼文列表沒有這個欄位，所以要逐篇打開貼文頁才拿得到。
 */
export function findImpressionCount(json: unknown): number | null {
  const seen = new Set<object>();
  let found: number | null = null;
  const walk = (node: unknown) => {
    if (found != null || !node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const o = node as Record<string, any>;
    const n = o.media?.text_post_app_info?.impression_count;
    if (n != null) { found = parseCount(n); return; }
    for (const v of Object.values(o)) walk(v);
  };
  walk(json);
  return found;
}

function toPost(o: Record<string, any>, username: string): Post | null {
  const author = o.user?.username;
  if (author && author.toLowerCase() !== username.toLowerCase()) return null; // 排除別人的回覆、轉發來源

  const info = o.text_post_app_info ?? {};
  // 串文的第 2、3 則是作者回覆自己（is_reply = true），不算獨立貼文；題目附的試算表也只收 is_reply = FALSE
  if (info.is_reply === true) return null;
  const code: string | undefined = o.code;
  const takenAt = typeof o.taken_at === 'number' ? new Date(o.taken_at * 1000).toISOString() : null;

  // Threads 把連結和 @提及 另外標成 text_fragments；連結預覽卡片也算一個連結
  const fragments: any[] = info.text_fragments?.fragments ?? [];
  const links = fragments
    .filter((f) => f.fragment_type === 'link')
    .map((f) => f.link_fragment?.uri ?? f.plaintext ?? '')
    .filter(Boolean);
  if (info.link_preview_attachment?.url) links.push(info.link_preview_attachment.url);
  const mentions = fragments
    .filter((f) => f.fragment_type === 'mention')
    .map((f) => f.mention_fragment?.mentioned_user?.username ?? String(f.plaintext ?? '').replace(/^@/, ''))
    .filter(Boolean);

  return {
    links,
    mentions,
    postId: String(o.pk ?? o.id ?? code),
    url: code ? `https://www.threads.com/@${username}/post/${code}` : null,
    text: o.caption?.text ?? '',
    postedAt: takenAt,
    likes: parseCount(o.like_count) ?? 0,
    replies: parseCount(info.direct_reply_count ?? o.reply_count) ?? 0,
    reposts: parseCount(info.repost_count) ?? 0,
    quotes: parseCount(info.quote_count) ?? 0,
    shares: parseCount(info.reshare_count) ?? 0,
    views: parseCount(info.impression_count ?? null),
  };
}
