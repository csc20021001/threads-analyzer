# Threads 帳號分析

輸入一個 Threads 帳號，用 Playwright 抓最近 30 篇貼文，算出互動率 Top 5、特徵相關性、關鍵字和分群。

## 架構

```
瀏覽器 ──▶ Next.js（Vercel）──insert job──▶ Supabase Postgres（RLS）
   ▲                                         │  ▲
   └──── Realtime 推送任務狀態 ◀──────────────┘  │
                                                 │ claim_next_job() / 寫回結果
                              Playwright worker（Docker）──▶ threads.com
```

- **web/**：Next.js App Router。登入（Supabase Email/Password）、建立任務、看報告。只用 anon key，所有讀寫都受 RLS 限制。
- **worker/**：輪詢 `pending` 任務 → 查 30 分鐘快取 → Playwright 爬取（失敗重試 2/4/8 秒）→ 分析 → 用 service role 寫回，寫入時帶上任務擁有者的 `user_id`。
- **shared/**：兩邊共用的型別、數字解析（「1.2萬」→ 12000）、分析邏輯。
- **supabase/migrations/**：資料表、RLS、`claim_next_job()`（`FOR UPDATE SKIP LOCKED`，多個 worker 也不會搶到同一筆）。

爬蟲不放在 Vercel：serverless 有執行時間上限，也不方便裝 Chromium。

## 資料取得

1. 監聽頁面的網路回應（`page.on('response')`）和 HTML 內嵌的 JSON，從中辨識貼文。
2. 都沒抓到時從 DOM 補（目前只拿文字和連結，數字選擇器待實測）。
3. 停止條件：滿 30 篇、連續 3 次捲動沒有新貼文、或遇到登入牆。
4. 抓不到曝光數存 `null`。曝光數覆蓋不到一半時，Top 5 改用互動量排序，並在報告上標示。
5. `DATA_SOURCE=mock` 可用假資料跑通整條流程。

### 實測結果（2026-11-11，@zuck）

| 模式 | 篇數 | 停止原因 | 曝光數 |
|---|---|---|---|
| 未登入 | 28 | 登入牆 | 無 |
| 副帳號登入 | 30 | 取滿 | 無 |

- 未登入時，頁面一開始內嵌的資料約 28 篇，往下捲就跳登入牆。
- 登入後可以翻頁（每頁約 13–16 篇）。登入方式：`npm run login -w worker` 開視窗手動登入，登入狀態存到 `worker/.auth/threads.json`（已排除在 git 和 Docker 之外）。
- 不論是否登入，別人帳號的貼文資料都沒有曝光數，推測只有作者本人看得到。因此 Top 5 會自動改用互動量排序，並在報告上註明。

Threads 的使用條款限制自動化存取；本專案只用於作業示範，只抓公開帳號、控制頻率（每次捲動間隔 2–4 秒）並快取結果。

## 本機開發

```bash
npm install
cp .env.example .env              # 填 worker 用的值
cp .env.example web/.env.local    # 填網頁用的值
```

1. 在 Supabase SQL Editor 執行 `supabase/migrations/0001_init.sql`。
2. 第一次跑爬蟲前安裝瀏覽器：`npx playwright install chromium`。Windows 上若安裝卡住，可在 `.env` 設 `BROWSER_CHANNEL=msedge` 改用內建的 Edge。
3. 網頁：`npm run dev:web`
4. worker：`npm run dev:worker`，或 `docker compose up --build`

### 爬取可行性實測

```bash
npm run probe -w worker -- <username>
```

開一個看得到的瀏覽器，把所有 JSON 回應存到 `worker/probe-out/`，印出每個回應辨識到幾篇貼文。用來確認欄位名稱、有沒有曝光數、未登入能捲多深，再回頭調整 `worker/src/scrape/extract.ts`。

## 測試

```bash
npm test          # shared 的單元測試
npm run typecheck
```
