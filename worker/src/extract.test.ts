import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPostsFromJson, findImpressionCount } from './scrape/extract.ts';

// 依 2026-11-11 實測的 Threads GraphQL 回應結構縮減而成：
// data.mediaData.edges[].node.thread_items[].post
const fixture = {
  data: {
    mediaData: {
      edges: [
        {
          node: {
            thread_items: [
              {
                post: {
                  pk: '111', code: 'Dd2BfosAcIX', taken_at: 1790626654,
                  user: { username: 'emoless_com' },
                  caption: { text: '二十一歲那年，我們在便利商店外面講了一句很蠢的話。' },
                  like_count: 736,
                  text_post_app_info: {
                    is_reply: false, direct_reply_count: 9, repost_count: 4, quote_count: 0, reshare_count: 98,
                    text_fragments: { fragments: [
                      { fragment_type: 'plaintext', plaintext: '二十一歲那年' },
                      { fragment_type: 'mention', plaintext: '@amy', mention_fragment: { mentioned_user: { username: 'amy' } } },
                      { fragment_type: 'link', plaintext: 'example.com', link_fragment: { uri: 'https://example.com' } },
                    ] },
                  },
                },
              },
              {
                // 串文第 2 則：作者回覆自己，不算獨立貼文
                post: {
                  pk: '112', code: 'DdSelfReply', taken_at: 1790713060,
                  user: { username: 'emoless_com' }, caption: { text: '（續）' }, like_count: 3,
                  text_post_app_info: { is_reply: true, direct_reply_count: 0 },
                },
              },
            ],
          },
        },
        {
          node: {
            thread_items: [{
              // 別人的貼文（例如被轉發的來源），要排除
              post: {
                pk: '999', code: 'Other', taken_at: 1790713000, user: { username: 'someone_else' },
                caption: { text: 'x' }, like_count: 10, text_post_app_info: { is_reply: false },
              },
            }],
          },
        },
      ],
    },
  },
};

test('extractPostsFromJson keeps only the author’s top-level posts', () => {
  const posts = extractPostsFromJson(fixture, 'Emoless_com');
  assert.equal(posts.length, 1);
  const p = posts[0];
  assert.equal(p.postId, '111');
  assert.equal(p.url, 'https://www.threads.com/@Emoless_com/post/Dd2BfosAcIX');
  assert.equal(p.postedAt, '2026-09-28T20:17:34.000Z');
  assert.deepEqual([p.likes, p.replies, p.reposts, p.quotes, p.shares], [736, 9, 4, 0, 98]);
  assert.equal(p.views, null); // 帳號首頁的資料沒有曝光數
  assert.deepEqual(p.links, ['https://example.com']);
  assert.deepEqual(p.mentions, ['amy']);
});

test('findImpressionCount reads the post page view count', () => {
  const page = { require: [[{ __bbox: { result: { data: { media: { text_post_app_info: { impression_count: 110638, id: 'x' } } } } } }]] };
  assert.equal(findImpressionCount(page), 110638);
  assert.equal(findImpressionCount({ data: { media: { text_post_app_info: {} } } }), null);
});
