import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCount } from './parse.ts';
import { analyze, clusterPosts, distinctiveTerms, spearman, tokenize } from './analysis.ts';
import type { Post } from './types.ts';

test('parseCount', () => {
  assert.equal(parseCount('1.2萬'), 12000);
  assert.equal(parseCount('3.4K'), 3400);
  assert.equal(parseCount('1,234'), 1234);
  assert.equal(parseCount('2M'), 2_000_000);
  assert.equal(parseCount('abc'), null);
  assert.equal(parseCount(null), null);
});

test('spearman', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  assert.equal(spearman([1, 1, 1], [1, 2, 3]), null);
});

test('tokenize drops stopwords and urls', () => {
  const t = tokenize('我今天在台北喝咖啡 https://x.com/a');
  assert.ok(t.includes('咖啡'));
  assert.ok(!t.some((w) => w.includes('http')));
});

test('distinctiveTerms picks words common in group but rare outside', () => {
  const inG = ['今天去爬山', '週末爬山好累', '爬山看日出', '晚餐吃拉麵'];
  const outG = ['工作好忙', '開會開到晚上', '今天又加班', '工作效率'];
  assert.equal(distinctiveTerms(inG, outG)[0], '爬山');
  assert.ok(!distinctiveTerms(inG, outG).includes('今天'));
});

test('clusters get keyword labels', () => {
  const posts: Post[] = Array.from({ length: 9 }, (_, i) => ({
    postId: String(i), url: null, postedAt: null, reposts: 0, quotes: 0, views: null,
    text: i >= 6 ? `咖啡 推薦 ${i}` : i >= 3 ? `工作 心得 ${i}` : `晚餐 拉麵 ${i}`,
    likes: i * 10, replies: i,
  }));
  const [high, mid, low] = clusterPosts(posts);
  assert.ok(high.keywords.includes('咖啡'), high.label);
  assert.ok(mid.keywords.includes('工作'), mid.label);
  assert.ok(low.keywords.includes('拉麵'), low.label);
  assert.ok(high.label.includes('・'));
});

test('analyze falls back to interactions when views missing', () => {
  const posts: Post[] = Array.from({ length: 6 }, (_, i) => ({
    postId: String(i), url: null, text: `貼文 ${i}`, postedAt: null,
    likes: i * 10, replies: i, reposts: 0, quotes: 0, views: null,
  }));
  const r = analyze(posts);
  assert.equal(r.summary.rankedBy, 'interactions');
  assert.equal(r.top5[0].postId, '5');
  assert.equal(r.clusters.length, 3);
});
