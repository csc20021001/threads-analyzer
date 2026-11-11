/**
 * 數據分析題：分群後用 NLP 分析各群成功／失敗原因。
 *
 * 方法（每一篇代表貼文都套用同一套）：
 * 1. 文本特徵：字數、句數、第一人稱密度、結尾是否提問、具體數字、對話、敘事時間標記、引言型、情緒詞。
 * 2. 以全部貼文計算每個特徵和總互動的 Spearman 相關，決定該特徵是「加分」還是「扣分」方向。
 * 3. 每篇代表貼文把特徵換成相對全體的 z 分數，乘上方向，取影響最大的 2–3 項寫成原因。
 * 4. 群組層級比較群內平均和全體平均，再加上 TF-IDF 區辨詞（群名）作為主題線索。
 */
import { spearmanSafe } from './stats.ts';
import type {
  CleanPost, Cluster, FeatureKey, FeatureProfile, GroupAnalysis, LengthRel, Observation,
  Overview, SampleAnalysis, TimeDist, TypeStat,
} from './types.ts';

const POSITIVE = ['開心', '喜歡', '愛', '幸福', '感謝', '謝謝', '溫暖', '笑', '好棒', '期待', '安心', '舒服', '值得', '勇氣', '珍惜'];
const NEGATIVE = ['難過', '哭', '累', '氣', '痛', '怕', '失望', '孤單', '委屈', '後悔', '焦慮', '崩潰', '討厭', '分手', '劈腿', '吵'];
const NARRATIVE_RE = /那年|那天|那時|那個晚上|昨天|今天|上週|上禮拜|後來|第一次|剛剛|晚上|早上|凌晨|[一二三四五六七八九十兩\d]+(?:歲|年|個月|週|天)/g;
const NUMBER_RE = /\d[\d,.]*|[一二三四五六七八九十兩百千萬]+(?=[年歲個次天萬塊元小時分鐘週月人])/g;
const DIALOGUE_RE = /「|(?:說|回|問)[：:]|^[：:]/gm;

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  charCount: '字數',
  sentences: '句數',
  firstPerson: '第一人稱密度（每百字「我」）',
  endsWithQuestion: '結尾提問',
  numbers: '具體數字',
  dialogue: '對話',
  narrative: '敘事時間標記',
  quoteStyle: '引言型',
  emotion: '情緒詞',
};
const KEYS = Object.keys(FEATURE_LABEL) as FeatureKey[];

export function textProfile(text: string): Record<FeatureKey, number> {
  const t = text.trim();
  const chars = [...t.replace(/\s/g, '')].length;
  const sentences = t.split(/[。！？!?\n]+/).map((s) => s.trim()).filter(Boolean);
  const count = (re: RegExp) => (t.match(re) ?? []).length;
  const lex = (words: string[]) => words.reduce((a, w) => a + t.split(w).length - 1, 0);
  return {
    charCount: chars,
    sentences: sentences.length,
    firstPerson: chars ? Number(((t.split('我').length - 1) / chars * 100).toFixed(1)) : 0,
    endsWithQuestion: /[?？][」）)」]*\s*$/.test(t) ? 1 : 0,
    numbers: count(NUMBER_RE),
    dialogue: count(DIALOGUE_RE),
    narrative: count(NARRATIVE_RE),
    quoteStyle: /^「/.test(t) && (/——|──|—\s*\S/.test(t) || chars <= 80) ? 1 : 0,
    emotion: lex(POSITIVE) + lex(NEGATIVE),
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const r1 = (x: number) => Number(x.toFixed(1));

/** 只描述事實與和全體平均的差距；好壞由前面的「加分／扣分」決定，避免字面評價和方向互相矛盾 */
function describe(key: FeatureKey, v: number, m: number): string {
  const vs = `全體平均 ${r1(m)}`;
  const more = v > m;
  switch (key) {
    case 'charCount': return `篇幅${more ? '較長' : '較短'}（${v} 字，${vs}）`;
    case 'sentences': return `句子${more ? '較多' : '較少'}（${v} 句，${vs}）`;
    case 'firstPerson': return `第一人稱${more ? '較多' : '較少'}（每百字 ${v} 個「我」，${vs}）`;
    case 'endsWithQuestion': return v ? '以問句結尾，邀請讀者回覆' : '沒有以問句結尾';
    case 'numbers': return `具體數字${more ? '較多' : '較少'}（${v} 處，${vs}）`;
    case 'dialogue': return v > 0 ? `有對話或引述（${v} 處，${vs}）` : '沒有對話或引述';
    case 'narrative': return `敘事時間標記${more ? '較多，有故事時間線' : '較少，較像片段感想'}（${v} 個，${vs}）`;
    case 'quoteStyle': return v ? '名言／引言型短句' : '個人經驗敘述，不是名言型短句';
    case 'emotion': return `情緒詞${more ? '較多' : '較少'}（${v} 個，${vs}）`;
  }
}

interface Direction { key: FeatureKey; rho: number | null; mean: number; sd: number }

function directions(posts: CleanPost[], profiles: Map<string, Record<FeatureKey, number>>): Direction[] {
  return KEYS.map((key) => {
    const xs = posts.map((p) => profiles.get(p.postId)![key]);
    return { key, rho: spearmanSafe(xs, posts.map((p) => p.interactions)), mean: mean(xs), sd: sd(xs) };
  });
}

function analyzeSample(
  p: CleanPost, f: Record<FeatureKey, number>, dirs: Direction[], group: Cluster['name'],
): SampleAnalysis {
  const contrib = dirs
    .filter((d) => d.sd > 0 && d.rho != null && Math.abs(d.rho) >= 0.1)
    .map((d) => {
      const z = (f[d.key] - d.mean) / d.sd;
      return { d, z, c: z * Math.sign(d.rho!) * Math.min(1, Math.abs(d.rho!) * 2) };
    })
    .filter((x) => Math.abs(x.z) >= 0.3);
  const pos = contrib.filter((x) => x.c > 0).sort((a, b) => b.c - a.c);
  const neg = contrib.filter((x) => x.c < 0).sort((a, b) => a.c - b.c);
  const fmt = (x: (typeof contrib)[number], good: boolean) =>
    `${good ? '加分' : '扣分'}：${describe(x.d.key, f[x.d.key], x.d.mean)}（此特徵與互動 ρ=${x.d.rho!.toFixed(2)}）`;

  let reasons: string[];
  let verdict: SampleAnalysis['verdict'];
  if (group === 'high') {
    verdict = 'success';
    reasons = pos.slice(0, 3).map((x) => fmt(x, true));
    if (!reasons.length) reasons = ['文本特徵與全體差異不大，互動可能來自主題本身或發文時機'];
  } else if (group === 'low') {
    verdict = 'failure';
    reasons = neg.slice(0, 3).map((x) => fmt(x, false));
    if (!reasons.length) reasons = ['文本特徵與全體差異不大，互動偏低可能來自主題或發文時機'];
  } else {
    verdict = 'mixed';
    reasons = [...pos.slice(0, 2).map((x) => fmt(x, true)), ...neg.slice(0, 2).map((x) => fmt(x, false))];
    if (!reasons.length) reasons = ['各項特徵都接近全體平均'];
  }
  return {
    postId: p.postId, url: p.url,
    excerpt: [...p.text].slice(0, 60).join('') + ([...p.text].length > 60 ? '…' : ''),
    likes: p.likes, replies: p.replies, interactions: p.interactions,
    features: f, verdict, reasons,
  };
}

export function analyzeGroups(posts: CleanPost[], clusters: Cluster[]): GroupAnalysis[] {
  const profiles = new Map(posts.map((p) => [p.postId, textProfile(p.text)]));
  const byId = new Map(posts.map((p) => [p.postId, p]));
  const dirs = directions(posts, profiles);
  return clusters.map((c) => {
    const members = c.postIds.map((id) => byId.get(id)!).filter(Boolean);
    const profile: FeatureProfile[] = dirs.map((d) => ({
      key: d.key,
      label: FEATURE_LABEL[d.key],
      value: r1(mean(members.map((p) => profiles.get(p.postId)![d.key]))),
      overall: r1(d.mean),
    }));
    const notable = profile
      .map((pf) => {
        const d = dirs.find((x) => x.key === pf.key)!;
        return { pf, z: d.sd > 0 ? (pf.value - d.mean) / d.sd : 0 };
      })
      .filter((x) => Math.abs(x.z) >= 0.25)
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
      .slice(0, 3)
      .map(({ pf }) => `${pf.label} ${pf.value}（全體 ${pf.overall}）`);
    const name = { high: '高互動群', mid: '中互動群', low: '低互動群' }[c.name];
    const summary = notable.length
      ? `${name}與全體差最多的是：${notable.join('；')}。群內區辨詞：${c.keywords.join('、') || '無'}。`
      : `${name}的文本特徵接近全體平均。群內區辨詞：${c.keywords.join('、') || '無'}。`;
    return {
      name: c.name,
      label: c.label,
      count: members.length,
      avgLikes: r1(mean(members.map((p) => p.likes))),
      avgReplies: r1(mean(members.map((p) => p.replies))),
      profile,
      summary,
      samples: c.samples.map((id) => byId.get(id)!).filter(Boolean)
        .map((p) => analyzeSample(p, profiles.get(p.postId)!, dirs, c.name)),
    };
  });
}

interface Candidate extends Observation { lift: number }

/** 從數據挑出差異最大的 3 點，寫成內容策略觀察；每點附上計算依據 */
export function buildObservations(input: {
  posts: CleanPost[]; overview: Overview; timeDist: TimeDist; lengthRel: LengthRel; postTypes: TypeStat[]; groups: GroupAnalysis[];
}): Observation[] {
  const { posts, overview: ov, timeDist, lengthRel, postTypes } = input;
  const avg = (ps: CleanPost[]) => mean(ps.map((p) => p.interactions));
  const fmt = (x: number) => r1(x).toLocaleString('en-US');
  const cands: Candidate[] = [];
  const profiles = posts.map((p) => ({ p, f: textProfile(p.text) }));

  const q = profiles.filter((x) => x.f.endsWithQuestion).map((x) => x.p);
  const nq = profiles.filter((x) => !x.f.endsWithQuestion).map((x) => x.p);
  if (q.length >= 2 && nq.length >= 2 && avg(nq) > 0) {
    const lift = avg(q) / avg(nq);
    cands.push({
      lift,
      title: lift >= 1 ? '結尾提問的貼文互動較高' : '結尾提問沒有帶來更多互動',
      detail: lift >= 1
        ? '以問句收尾等於給讀者一個回覆的理由。建議在故事型貼文最後加一句和讀者經驗相關的問題。'
        : '這個帳號的提問結尾沒有拉高互動，讀者更在意內容本身；與其硬加問句，不如把故事寫完整。',
      evidence: `結尾提問 ${q.length} 篇平均互動 ${fmt(avg(q))}；其餘 ${nq.length} 篇平均 ${fmt(avg(nq))}（${r1(lift)} 倍）`,
    });
  }

  const story = profiles.filter((x) => x.f.narrative >= 2 && !x.f.quoteStyle).map((x) => x.p);
  const quote = profiles.filter((x) => x.f.quoteStyle).map((x) => x.p);
  if (story.length >= 2 && quote.length >= 2 && avg(quote) > 0) {
    const lift = avg(story) / avg(quote);
    cands.push({
      lift,
      title: lift >= 1 ? '個人故事明顯勝過名言摘錄' : '名言摘錄的表現不輸個人故事',
      detail: lift >= 1
        ? '有時間線、有具體細節的個人經驗，比轉貼名言更能引起共鳴。名言可以保留作為過渡，但主力應放在故事。'
        : '短句名言在這個帳號也有不錯的表現，可作為低成本的穩定內容，和長篇故事交替。',
      evidence: `故事型 ${story.length} 篇平均互動 ${fmt(avg(story))}；引言型 ${quote.length} 篇平均 ${fmt(avg(quote))}（${r1(lift)} 倍）`,
    });
  }

  const lb = lengthRel.buckets.filter((b) => b.count >= 2);
  if (lb.length >= 2) {
    const best = lb.reduce((a, b) => (b.avgInteractions > a.avgInteractions ? b : a));
    const worst = lb.reduce((a, b) => (b.avgInteractions < a.avgInteractions ? b : a));
    if (worst.avgInteractions > 0 && best !== worst) {
      const lift = best.avgInteractions / worst.avgInteractions;
      cands.push({
        lift,
        title: `${best.label}（${best.range}）表現最好`,
        detail: `字數和互動的 Spearman 相關為 ${lengthRel.rhoInteractions ?? '—'}。${best.label}平均互動是${worst.label}的 ${r1(lift)} 倍，篇幅可以往這個區間靠攏。`,
        evidence: lb.map((b) => `${b.label} ${b.count} 篇平均 ${fmt(b.avgInteractions)}`).join('；'),
      });
    }
  }

  if (timeDist.bestHour && ov.avgInteractions > 0) {
    const h = timeDist.bestHour;
    const lift = h.avgInteractions / ov.avgInteractions;
    cands.push({
      lift,
      title: `${h.key} 點發文的平均互動最高`,
      detail: `最常發文的時段是 ${timeDist.busiestHour?.key ?? '—'} 點，但互動最好的是 ${h.key} 點。可以把重點貼文排在這個時段測試；樣本數少，需要持續觀察。`,
      evidence: `${h.key} 點 ${h.count} 篇平均互動 ${fmt(h.avgInteractions)}；全體平均 ${fmt(ov.avgInteractions)}（${r1(lift)} 倍）`,
    });
  }

  const types = postTypes.filter((t) => t.count >= 2);
  if (types.length >= 2) {
    const best = types.reduce((a, b) => (b.avgInteractions > a.avgInteractions ? b : a));
    const worst = types.reduce((a, b) => (b.avgInteractions < a.avgInteractions ? b : a));
    if (worst.avgInteractions > 0 && best !== worst) {
      const lift = best.avgInteractions / worst.avgInteractions;
      cands.push({
        lift,
        title: `「${best.type}」貼文的互動高於「${worst.type}」`,
        detail: `在可比較的類型裡，${best.type}平均互動是${worst.type}的 ${r1(lift)} 倍。`,
        evidence: types.map((t) => `${t.type} ${t.count} 篇平均 ${fmt(t.avgInteractions)}`).join('；'),
      });
    }
  } else if (postTypes[0]?.share >= 0.9) {
    cands.push({
      lift: 1.01,
      title: '幾乎全是純文字貼文',
      detail: '這個帳號很少使用連結、hashtag 或標記他人，曝光主要靠內容本身被轉分享。可以小量測試 Threads 主題標籤來接觸新讀者。',
      evidence: `純文字 ${postTypes[0].count} 篇，占 ${r1(postTypes[0].share * 100)}%`,
    });
  }

  return cands
    .sort((a, b) => Math.abs(Math.log(b.lift)) - Math.abs(Math.log(a.lift)))
    .slice(0, 3)
    .map(({ title, detail, evidence }) => ({ title, detail, evidence }));
}
