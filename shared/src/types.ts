export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
export type DataSource = 'playwright' | 'api' | 'mock';

/** 爬蟲／API 取回、清理後的一篇貼文 */
export interface Post {
  postId: string;
  url: string | null;
  text: string;
  postedAt: string | null; // ISO
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  shares: number; // 紙飛機「分享」數（Threads 的 reshare_count）
  views: number | null; // 單篇貼文頁的瀏覽數（impression_count）；抓不到就是 null
  /** Threads 另外標記的連結與 @提及（文字裡看不出來的，例如連結預覽卡片）；清理時會和內文擷取的合併 */
  links?: string[];
  mentions?: string[];
}

export type PostType = '純文字' | '含連結' | '含 hashtag' | '含 mention' | '混合';

/** 清理後的貼文：統一台灣時區、加上文字特徵與類型 */
export interface CleanPost extends Post {
  postedAtLocal: string | null; // 'YYYY-MM-DD HH:mm'（Asia/Taipei）
  weekday: number | null; // 0 = 週日 … 6 = 週六（Asia/Taipei）
  hour: number | null; // 0–23（Asia/Taipei）
  charCount: number;
  hashtags: string[];
  mentionList: string[];
  urlCount: number;
  postType: PostType;
  interactions: number;
  rate: number | null;
}

export interface CleanReport {
  inputCount: number;
  duplicatesRemoved: number;
  missing: { postedAt: number; views: number; text: number; url: number };
}

export type RankedPost = CleanPost;

export interface Correlation {
  metric: 'length' | 'hour' | 'hasQuestion' | 'hasLink';
  rho: number | null;
  n: number;
}

export interface Overview {
  postCount: number;
  dateFrom: string | null; // 台灣時間
  dateTo: string | null;
  avgLikes: number;
  avgReplies: number;
  avgReposts: number;
  avgQuotes: number;
  avgShares: number;
  avgViews: number | null;
  avgInteractions: number;
  medianInteractions: number;
  overallRate: number | null; // 總互動 ÷ 總曝光（只算有曝光數的貼文）
  viewsCoverage: number;
}

export interface TimeBucket {
  key: number;
  label: string;
  count: number;
  avgInteractions: number;
}

export interface TimeDist {
  byWeekday: TimeBucket[]; // 7 格，週一到週日
  byHour: TimeBucket[]; // 24 格
  busiestWeekday: TimeBucket | null;
  busiestHour: TimeBucket | null;
  bestWeekday: TimeBucket | null; // 平均互動最高，且至少 2 篇
  bestHour: TimeBucket | null;
}

export interface LengthBucket {
  label: string;
  range: string;
  count: number;
  avgInteractions: number;
  avgRate: number | null;
}

export interface LengthRel {
  rhoInteractions: number | null;
  rhoRate: number | null;
  buckets: LengthBucket[];
  points: { postId: string; charCount: number; interactions: number }[];
}

export interface TypeStat {
  type: PostType;
  count: number;
  share: number;
  avgInteractions: number;
  avgRate: number | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

export type FeatureKey =
  | 'charCount' | 'sentences' | 'firstPerson' | 'endsWithQuestion' | 'numbers'
  | 'dialogue' | 'narrative' | 'quoteStyle' | 'emotion';

export interface FeatureProfile {
  key: FeatureKey;
  label: string;
  value: number;
  overall: number;
}

export interface SampleAnalysis {
  postId: string;
  url: string | null;
  excerpt: string;
  likes: number;
  replies: number;
  interactions: number;
  features: Record<FeatureKey, number>;
  verdict: 'success' | 'failure' | 'mixed';
  reasons: string[];
}

export interface GroupAnalysis {
  name: ClusterName;
  label: string;
  count: number;
  avgLikes: number;
  avgReplies: number;
  profile: FeatureProfile[];
  summary: string;
  samples: SampleAnalysis[];
}

export interface Observation {
  title: string;
  detail: string;
  evidence: string;
}

export interface Keyword {
  term: string;
  score: number;
}

export type ClusterName = 'high' | 'mid' | 'low';

export interface Cluster {
  name: ClusterName;
  label: string; // 用這群最有代表性的關鍵字取名，例如「旅遊・咖啡・週末」
  keywords: string[];
  postIds: string[];
  samples: string[]; // 給人工覆核的代表貼文
}

export interface AnalysisResult {
  summary: {
    postCount: number;
    viewsCoverage: number; // 有曝光數的比例 0–1
    rankedBy: 'rate' | 'interactions';
  };
  cleaning: CleanReport;
  overview: Overview;
  top5: RankedPost[];
  timeDist: TimeDist;
  lengthRel: LengthRel;
  postTypes: TypeStat[];
  hashtags: TagCount[];
  correlations: Correlation[];
  keywords: Keyword[];
  clusters: Cluster[];
  groups: GroupAnalysis[];
  observations: Observation[];
}
