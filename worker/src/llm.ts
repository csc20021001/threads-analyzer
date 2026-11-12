/**
 * 用 LLM 依分析結果產出內容策略建議（題目要求「用 LLM 自動產出內容策略建議」）。
 *
 * 兩種來源，依序選用：
 * 1. Claude：設定 ANTHROPIC_API_KEY（或 ANTHROPIC_AUTH_TOKEN／ANTHROPIC_PROFILE）時使用。
 * 2. 本地模型：設定 LOCAL_LLM_URL 時，呼叫 LM Studio 等 OpenAI 相容的本機伺服器（預設模型 google/gemma-4-e4b）。
 * 兩者都沒設定就回傳 null，畫面改顯示規則式觀察。
 *
 * - 只送彙總數字與代表貼文摘錄，不送整份原始資料。
 * - 兩種來源都用同一個 schema 驗證輸出；失敗（網路、額度、逾時、拒答、格式不符）一律回傳 null，不讓分析任務因此失敗。
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { AnalysisResult } from '@app/shared';
import type { LlmSuggestions } from './db.ts';

const CLAUDE_MODEL = 'claude-opus-5-5';
const LOCAL_URL = process.env.LOCAL_LLM_URL?.replace(/\/+$/, '') || '';
const LOCAL_MODEL = process.env.LOCAL_LLM_MODEL || 'google/gemma-4-e4b';
const LOCAL_TIMEOUT_MS = Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? 180_000);

const SuggestionSchema = z.object({
  items: z.array(z.object({
    title: z.string().min(1),
    detail: z.string().min(1),
    basis: z.string().min(1),
  })).min(1),
});

const SYSTEM = `你是社群內容策略顧問。根據使用者提供的 Threads 帳號分析數據，寫 3 到 5 條具體、可執行的內容策略建議，使用繁體中文。
每條建議：
- title：一句話的建議（20 字內）
- detail：怎麼做，具體到可以直接照做（60 字內）
- basis：引用數據中的哪個數字支持這條建議
只根據提供的數據推論，不可編造數據中沒有的數字；樣本只有約 30 篇，篇數少的差異要說明是待驗證的假設，不要寫成定論。`;

const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

export function llmEnabled(): boolean {
  return hasClaude() || Boolean(LOCAL_URL);
}

export function llmLabel(): string {
  if (hasClaude()) return `Claude（${CLAUDE_MODEL}）`;
  if (LOCAL_URL) return `本地模型（${LOCAL_MODEL}，${LOCAL_URL}）`;
  return '關閉（未設定 ANTHROPIC_API_KEY 或 LOCAL_LLM_URL，改顯示規則式觀察）';
}

function digest(username: string, r: AnalysisResult) {
  return {
    帳號: `@${username}`,
    總覽: r.overview,
    時間分布: {
      最常發文星期: r.timeDist.busiestWeekday?.label,
      最常發文小時: r.timeDist.busiestHour?.key,
      各星期: r.timeDist.byWeekday.map((b) => ({ 星期: b.label, 篇數: b.count, 平均互動: b.avgInteractions })),
    },
    篇幅: r.lengthRel.buckets,
    貼文類型: r.postTypes,
    關鍵字: r.keywords.slice(0, 15).map((k) => k.term),
    hashtag: r.hashtags,
    規則式觀察: r.observations,
    分群: r.groups.map((g) => ({
      群組: g.name,
      篇數: g.count,
      平均讚: g.avgLikes,
      平均回覆: g.avgReplies,
      特徵: g.summary,
      代表貼文: g.samples.map((s) => ({ 摘錄: s.excerpt, 讚: s.likes, 回覆: s.replies, 原因: s.reasons })),
    })),
  };
}

export async function suggest(username: string, result: AnalysisResult): Promise<LlmSuggestions | null> {
  const input = JSON.stringify(digest(username, result));
  if (hasClaude()) return suggestClaude(input);
  if (LOCAL_URL) return suggestLocal(input);
  return null;
}

async function suggestClaude(input: string): Promise<LlmSuggestions | null> {
  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      output_config: { effort: 'medium', format: zodOutputFormat(SuggestionSchema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: input }],
    });
    if (response.stop_reason === 'refusal') {
      console.warn('[llm] 模型拒答，改用規則式觀察');
      return null;
    }
    const items = response.parsed_output?.items?.slice(0, 5) ?? [];
    return items.length ? { model: response.model, items } : null;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.warn('[llm] API 金鑰無效，略過 LLM 建議');
    else if (e instanceof Anthropic.RateLimitError) console.warn('[llm] 額度或速率限制，略過 LLM 建議');
    else if (e instanceof Anthropic.APIError) console.warn(`[llm] API 錯誤 ${e.status}，略過 LLM 建議`);
    else console.warn('[llm] 產生建議失敗，略過', e);
    return null;
  }
}

/** LM Studio 等 OpenAI 相容伺服器：用 json_schema 限制輸出格式，回來後再用同一個 zod schema 驗證 */
async function suggestLocal(input: string): Promise<LlmSuggestions | null> {
  try {
    const res = await fetch(`${LOCAL_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
      body: JSON.stringify({
        model: LOCAL_MODEL,
        temperature: 0.3,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: input },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'suggestions', strict: true, schema: z.toJSONSchema(SuggestionSchema) } },
      }),
    });
    if (!res.ok) {
      console.warn(`[llm] 本地模型回應 ${res.status}，略過 LLM 建議`);
      return null;
    }
    const data = await res.json() as { model?: string; choices?: { message?: { content?: string } }[] };
    const text = data.choices?.[0]?.message?.content ?? '';
    const parsed = SuggestionSchema.safeParse(JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')));
    if (!parsed.success) {
      console.warn('[llm] 本地模型輸出格式不符，略過 LLM 建議');
      return null;
    }
    return { model: `${data.model ?? LOCAL_MODEL}（本地）`, items: parsed.data.items.slice(0, 5) };
  } catch (e) {
    console.warn('[llm] 本地模型呼叫失敗，略過', (e as Error).message);
    return null;
  }
}
