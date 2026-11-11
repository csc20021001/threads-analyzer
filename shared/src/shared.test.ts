import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCount, parseThreadsInput } from './parse.ts';
import { analyze, clusterPosts, distinctiveTerms, spearman, tokenize } from './analysis.ts';
import { classify, cleanPosts, textFeatures, toLocal } from './clean.ts';
import { textProfile } from './nlp.ts';
import type { Post } from './types.ts';

const post = (over: Partial<Post> & { postId: string }): Post => ({
  url: null, text: '', postedAt: null, likes: 0, replies: 0, reposts: 0, quotes: 0, shares: 0, views: null, ...over,
});

test('parseThreadsInput accepts username, @username and URLs', () => {
  assert.equal(parseThreadsInput('emoless_com'), 'emoless_com');
  assert.equal(parseThreadsInput('@Emoless_com'), 'emoless_com');
  assert.equal(parseThreadsInput('https://www.threads.com/@emoless_com'), 'emoless_com');
  assert.equal(parseThreadsInput('threads.net/@zuck/post/DeZtp-TkQHh'), 'zuck');
  assert.equal(parseThreadsInput('https://example.com/@zuck'), null);
  assert.equal(parseThreadsInput('有空白 的'), null);
});

test('toLocal converts UTC to Asia/Taipei', () => {
  // 2026-11-11T08:02:27Z = 台灣 16:02，週三
  assert.deepEqual(toLocal('2026-11-11T08:02:27.000Z'), { postedAtLocal: '2026-11-11 16:02', weekday: 3, hour: 16 });
  // 跨日：UTC 週六 20:00 = 台灣週日 04:00
  assert.deepEqual(toLocal('2026-11-07T20:00:00.000Z'), { postedAtLocal: '2026-11-08 04:00', weekday: 0, hour: 4 });
  assert.deepEqual(toLocal(null), { postedAtLocal: null, weekday: null, hour: null });
});

test('textFeatures and classify', () => {
  const f = textFeatures('今天 #讀書會 找 @amy.lin 一起 https://a.com/x 和 https://b.com', [], []);
  assert.deepEqual(f.hashtags, ['讀書會']);
  assert.deepEqual(f.mentionList, ['amy.lin']);
  assert.equal(f.urlCount, 2);
  assert.equal(classify(f), '混合');
  assert.equal(classify(textFeatures('只是一段文字')), '純文字');
  assert.equal(classify(textFeatures('看這個', ['https://x.com'])), '含連結');
  // email 不是 mention
  assert.deepEqual(textFeatures('寄到 a@b.com').mentionList, []);
});

test('cleanPosts dedupes, counts missing fields and sums interactions like the sheet', () => {
  const { posts, report } = cleanPosts([
    post({ postId: '1', likes: 735, replies: 9, reposts: 4, quotes: 0, shares: 98, text: 'a', postedAt: '2026-09-28T20:17:34Z', url: 'u' }),
    post({ postId: '1', likes: 736, replies: 9, reposts: 4, quotes: 0, shares: 98, text: 'a', postedAt: '2026-09-28T20:17:34Z', url: 'u' }),
    post({ postId: '2', likes: -3, text: '  ' }),
  ]);
  assert.equal(report.duplicatesRemoved, 1);
  assert.deepEqual(report.missing, { postedAt: 1, views: 2, text: 1, url: 1 });
  assert.equal(posts.find((p) => p.postId === '1')!.interactions, 847); // 736+9+4+0+98
  assert.equal(posts.find((p) => p.postId === '2')!.likes, 0); // 負數視為缺失
});

test('textProfile picks up story, question and quote features', () => {
  const story = textProfile('二十歲那年，我把告白寫在第 87 頁。他說：「謝謝。」後來沒有再聯絡。你們有過嗎？');
  assert.equal(story.endsWithQuestion, 1);
  assert.ok(story.narrative >= 2);
  assert.ok(story.numbers >= 1);
  assert.ok(story.dialogue >= 1);
  assert.equal(story.quoteStyle, 0);
  assert.equal(textProfile('「最糟糕的，是失去自己。」 ——Peter Su').quoteStyle, 1);
});

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

test('tokenize drops common English function words, keeps content words', () => {
  const t = tokenize('Today we’re sharing our new model at Meta Connect, get yours');
  assert.deepEqual(t, ['sharing', 'model', 'meta', 'connect']);
});

test('distinctiveTerms picks words common in group but rare outside', () => {
  const inG = ['今天去爬山', '週末爬山好累', '爬山看日出', '晚餐吃拉麵'];
  const outG = ['工作好忙', '開會開到晚上', '今天又加班', '工作效率'];
  assert.equal(distinctiveTerms(inG, outG)[0], '爬山');
  assert.ok(!distinctiveTerms(inG, outG).includes('今天'));
});

test('clusters get keyword labels', () => {
  const posts: Post[] = Array.from({ length: 9 }, (_, i) => ({
    postId: String(i), url: null, postedAt: null, reposts: 0, quotes: 0, shares: 0, views: null,
    text: i >= 6 ? `咖啡 推薦 ${i}` : i >= 3 ? `工作 心得 ${i}` : `晚餐 拉麵 ${i}`,
    likes: i * 10, replies: i,
  }));
  const [high, mid, low] = clusterPosts(posts);
  assert.ok(high.keywords.includes('咖啡'), high.label);
  assert.ok(mid.keywords.includes('工作'), mid.label);
  assert.ok(low.keywords.includes('拉麵'), low.label);
  assert.ok(high.label.includes('・'));
});

test('analyze produces every required block', () => {
  const posts: Post[] = Array.from({ length: 12 }, (_, i) => post({
    postId: String(i),
    text: i % 3 === 0 ? `那年我第一次去台北，${i} 歲。後來呢？` : i % 3 === 1 ? '「人生很長。」 ——某人' : `今天去 #咖啡 店 ${i}`,
    postedAt: new Date(Date.UTC(2026, 10, 1 + i, 12, 0)).toISOString(),
    likes: i * 3, replies: i, views: 100 + i * 10,
  }));
  const r = analyze(posts);
  assert.equal(r.overview.postCount, 12);
  assert.equal(r.summary.rankedBy, 'rate');
  assert.equal(r.timeDist.byWeekday.length, 7);
  assert.equal(r.timeDist.byHour.length, 24);
  assert.equal(r.timeDist.byHour[20].count, 12); // UTC 12 點 = 台灣 20 點
  assert.equal(r.lengthRel.buckets.length, 3);
  assert.ok(r.postTypes.find((t) => t.type === '含 hashtag')!.count === 4);
  assert.deepEqual(r.hashtags[0], { tag: '咖啡', count: 4 });
  assert.equal(r.groups.length, 3);
  for (const g of r.groups) {
    assert.ok(g.samples.length >= 3 && g.samples.length <= 5, `${g.name} 有 ${g.samples.length} 篇樣本`);
    for (const s of g.samples) assert.ok(s.reasons.length >= 1);
  }
  assert.ok(r.observations.length >= 1 && r.observations.length <= 3);
});

test('real scraped data: 3 observations, none built on tiny groups or driven only by outliers', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  for (const name of ['emoless_com_2026-11-11', 'zuck_2026-11-11']) {
    const file = resolve(import.meta.dirname, '../../data', `${name}.json`);
    const raw = JSON.parse(await readFile(file, 'utf8')).posts as Post[];
    const r = analyze(raw);
    assert.equal(r.observations.length, 3, name);
    for (const o of r.observations) {
      // 依據裡每個「N 篇」的組別都至少 3 篇（篇幅、類型的完整列表除外，那些標明只比較 3 篇以上）
      if (!o.evidence.includes('只比較') && !o.evidence.includes('平均分配')) {
        for (const m of o.evidence.matchAll(/(\d+) 篇/g)) assert.ok(Number(m[1]) >= 3, `${name}：${o.evidence}`);
      }
      assert.ok(!/明顯/.test(o.title) || !/中位數 (\d+(\.\d+)?)）；引言型 \d+ 篇平均 [\d,.]+（中位數 \1）/.test(o.evidence));
    }
  }
  const emo = analyze(JSON.parse(await readFile(resolve(import.meta.dirname, '../../data/emoless_com_2026-11-11.json'), 'utf8')).posts);
  const story = emo.observations.find((o) => o.evidence.startsWith('故事型'));
  if (story) assert.ok(story.title.includes('爆文'), `中位數 8 對 6.5 不該寫成明顯勝過：${story.title}`);
});

test('analyze falls back to interactions when views missing', () => {
  const posts: Post[] = Array.from({ length: 6 }, (_, i) => ({
    postId: String(i), url: null, text: `貼文 ${i}`, postedAt: null,
    likes: i * 10, replies: i, reposts: 0, quotes: 0, shares: 0, views: null,
  }));
  const r = analyze(posts);
  assert.equal(r.summary.rankedBy, 'interactions');
  assert.equal(r.top5[0].postId, '5');
  assert.equal(r.clusters.length, 3);
});
