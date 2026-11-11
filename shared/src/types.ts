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
  views: number | null; // 抓不到就是 null
}

export interface RankedPost extends Post {
  interactions: number;
  rate: number | null; // interactions / views
}

export interface Correlation {
  metric: 'length' | 'hour' | 'hasQuestion' | 'hasLink';
  rho: number | null;
  n: number;
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
  top5: RankedPost[];
  correlations: Correlation[];
  keywords: Keyword[];
  clusters: Cluster[];
}
