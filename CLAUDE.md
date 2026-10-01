# 飲食控制 APP — CLAUDE.md

## 帳號資訊

| 服務 | 帳號 |
|---|---|
| GitHub | MrflyGG |
| Vercel | mrflygg（連結 MrflyGG GitHub）— 域名：diet-tracker-bot-nine.vercel.app |
| Supabase | MrflyGG's Org（project: diet-tracker-bot，ref: cjzhufsmudltwbxgicxn）|
| Telegram | 使用者本人帳號 |
| Anthropic | goffly.hou@gmail.com（API key 已設定）|
| Upstash | 待建立 |

## 專案概要

飲食・睡眠・運動整合追蹤系統。
Telegram Bot 為每日互動介面，Web 設定頁管理個人資料與提醒設定。
AI（Claude Haiku 4.5）分析食物照片與文字，給出營養估算與下一餐建議。

## 技術棧

| 層 | 技術 |
|---|---|
| 前端/後端 | Next.js 15 + TypeScript + Tailwind |
| 資料庫 | Supabase（PostgreSQL + Auth）|
| AI | Claude Haiku 4.5（Anthropic SDK）|
| Bot | Telegram Bot API（Webhook）|
| 排程提醒 | Upstash QStash |
| 部署 | Vercel |

## 目錄結構

```
飲食控制APP/
├── CLAUDE.md
├── middleware.ts              ← Auth 守衛（排除 /api/ 路由）
├── app/
│   ├── layout.tsx
│   ├── page.tsx               ← 首頁（導向登入或設定）
│   ├── login/page.tsx         ← Email + 密碼登入（非 magic link）
│   ├── settings/
│   │   ├── page.tsx           ← 個人資料、目標、提醒時間、InBody 卡片
│   │   ├── SettingsForm.tsx   ← 含 Telegram 綁定 UI、AI 計算目標按鈕
│   │   └── actions.ts         ← saveProfile / saveReminders / createBindToken
│   └── api/
│       ├── telegram/route.ts  ← Telegram Webhook（v1.5.3）
│       ├── auth/callback/route.ts
│       └── cron/route.ts      ← Upstash QStash 觸發點
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── admin.ts           ← Service role client（bypass RLS）
│   ├── telegram.ts            ← sendMessage / setWebhook
│   ├── claude.ts              ← AI 分析（v1.4.0）
│   └── nutrition.ts           ← calcDailyGoals()（純數學）
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql    ← 7 張主表 + RLS
│       ├── 002_bind_tokens.sql
│       ├── 003_cron_reminders.sql
│       └── 004_inbody.sql     ← inbody_records + user_profiles 新欄位
└── docs/
    └── SCHEMA.md
```

## 資料庫 Schema

| Table | 說明 |
|---|---|
| `user_profiles` | 個人資料、每日目標（含 goal_fat_loss_kg / goal_deadline / daily_water_ml）|
| `telegram_links` | Telegram ID ↔ 帳號綁定 |
| `telegram_bind_tokens` | 綁定暫存 token（15 分鐘 TTL）|
| `reminder_settings` | 每種提醒的時間與開關 |
| `daily_logs` | 每天一筆（體重、睡眠、總結）|
| `food_entries` | 每筆飲食記錄 |
| `exercise_entries` | 每筆運動記錄 |
| `water_entries` | 每筆喝水記錄 |
| `inbody_records` | InBody 量測記錄（migration 004）|

## 開發階段

| Phase | 內容 | 狀態 |
|---|---|---|
| 0 | 骨架 + GitHub + Vercel 首次部署 | ✅ |
| 1 | Email 登入 + Web 設定頁 + DB schema | ✅ |
| 2 | Telegram Bot 串通 + 帳號綁定 | ✅ |
| 3 | Claude AI 串接（食物/運動分析 + 喝水/體重/餐別修正）| ✅ |
| 4 | 提醒系統（Supabase pg_cron + pg_net）| ✅ |
| 5 | 每日總結 + InBody 解讀 | 待開始 |

### Phase 3–4 後補功能（2026-10-01）

| 功能 | 說明 |
|---|---|
| 結構化訓練日誌分析 | 教練日誌格式（硬舉/臥推/泰拳等）→ AI 估算整場消耗 |
| InBody 資料建表 | migration 004，inbody_records + user_profiles 三個新欄位 |
| 設定頁 AI 計算目標 | calcDailyGoals() 根據 BMR + 除脂體重 + 目標計算每日建議 |
| 查詢顯示碳水/脂肪% | 每次查詢顯示四大營養素達成率 |
| 未知訊息友善回覆 | 不再顯示「發生錯誤」，改為引導說明 |

## 核心邏輯

### 餐別自動判斷（時間區段）
- 06:00–10:00 → 早餐
- 10:00–14:00 → 午餐
- 14:00–17:00 → 下午點心
- 17:00–21:00 → 晚餐
- 21:00–06:00 → 宵夜（跨日邊界主動確認）

### AI Context（每次請求帶入）
- 使用者個人資料 + 每日目標
- 今天已記錄的飲食/運動/水分/體重
- 近 7 天每日摘要（體重趨勢 + 達標率）

### 提醒邏輯
- 時間到 → Upstash QStash 打 `/api/cron`
- 查該類型今天是否已記錄
- 未記錄 → 傳 Telegram 提醒
- 已記錄 → 跳過

### 修正規則
- 當天自然語言修正（「剛剛那個飯少一點」）
- 跨日後不可修改歷史記錄

## 重要決策記錄

| 決策 | 原因 | 排除的方案 |
|---|---|---|
| Telegram Bot 為主介面 | 開發快、推播原生支援、使用者熟悉 | 純 Web App |
| Claude Haiku 4.5 | 複雜指令跟隨穩定、健康資料隱私、成本低 | Gemini 免費版 |
| 結構化存資料庫 | 省 token、可畫圖表、查詢快 | 存原始對話 log |
| Upstash QStash 排程 | Vercel Hobby 只有 1 個 Cron slot | Vercel Cron |
| 共用 API Key | 個人用量免費額度夠 | BYOK |
| middleware 排除 /api/ | Telegram webhook 是 server-to-server，無 session cookie | 個別路由加驗證 |
| Email+密碼登入 | iOS Telegram in-app browser 跨 app 無法取得 magic link session | magic link |
| inbody_records 無 FK constraint | Supabase SQL Editor 無法驗證跨 schema auth.users FK；RLS 已保護 | REFERENCES auth.users |

## 已知地雷 ⚠️

- **middleware 必須排除 `/api/`**：Telegram webhook 沒有 session cookie，若 middleware 攔截會永遠 307 到 `/login`，綁定靜默失敗
- **Vercel 域名**：deploy 後實際域名是 `diet-tracker-bot-nine.vercel.app`，非 `diet-tracker-bot.vercel.app`（後者 404）
- **Vercel Hobby cron** 只有 1 個 slot，提醒系統必須走 Upstash QStash
- **Supabase SQL Editor 跨 schema FK**：`REFERENCES auth.users(id)` 在 SQL Editor 執行 INSERT 時會報 FK 錯誤，即使 user 確實存在。解法：DROP FK，改用 RLS 保護
- **InBody 照片未加 caption 會被誤判為食物**：`isInBodyPhoto()` 靠 caption/text 關鍵字判斷，照片必須附上「inbody」字樣才會走 InBody 流程
- 凌晨訊息需確認是否跨日
- Telegram Webhook 需要 HTTPS，本機開發用 ngrok
- Supabase `telegram_links` upsert 衝突鍵是 `telegram_user_id`，同一 Telegram 帳號重新綁定會覆蓋舊的 `user_id`

## 當前狀態

- 正在做：Phase 3 & 4 + 補強功能完成，實機測試通過
- 下一步：Phase 5 — 每日總結、睡眠記錄、InBody 趨勢圖；或 Web 儀表板
