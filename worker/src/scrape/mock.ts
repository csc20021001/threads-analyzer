import type { Post } from '@app/shared';

const SAMPLES = [
  '今天去台北看展，人超多但很值得', '新產品上線了！大家覺得介面如何？', '分享三個提升效率的小技巧',
  '週末去爬山，天氣超好', '有人也覺得最近咖啡變貴了嗎？', '整理了一份行銷入門書單 https://example.com',
  '工作五年的心得：溝通比技術重要', '晚餐吃了拉麵', '你們會怎麼安排一天的時間？', '推薦一個好用的筆記工具',
];

/** 方法二備援：固定種子的假資料，用來在沒網路或被擋時跑通整條流程 */
export function mockPosts(username: string, n = 30): Post[] {
  let seed = [...username].reduce((s, c) => s + c.charCodeAt(0), 7);
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const now = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const views = Math.round(500 + rnd() * 20000);
    return {
      postId: `mock-${i}`,
      url: null,
      text: SAMPLES[i % SAMPLES.length],
      postedAt: new Date(now - i * 36e5 * (6 + rnd() * 30)).toISOString(),
      likes: Math.round(views * rnd() * 0.08),
      replies: Math.round(views * rnd() * 0.01),
      reposts: Math.round(views * rnd() * 0.005),
      quotes: Math.round(views * rnd() * 0.002),
      shares: Math.round(views * rnd() * 0.003),
      views,
    };
  });
}
