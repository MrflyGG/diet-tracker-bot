// v1.2.0 | 2026-09-30 | add exercise analysis + weight/exercise/correction detectors

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface FoodAnalysis {
  food_name: string
  quantity_desc: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'midnight'
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  tip: string
}

interface UserContext {
  gender?: string | null
  age?: number | null
  height_cm?: number | null
  goal?: string | null
  daily_calories?: number | null
  daily_protein_g?: number | null
  daily_carbs_g?: number | null
  daily_fat_g?: number | null
}

interface TodayTotals {
  calories: number
  protein_g: number
}

function getTaipeiHour(): number {
  const utcMs = Date.now()
  return new Date(utcMs + 8 * 3600000).getUTCHours()
}

function detectMealType(): FoodAnalysis['meal_type'] {
  const h = getTaipeiHour()
  if (h >= 6 && h < 10) return 'breakfast'
  if (h >= 10 && h < 14) return 'lunch'
  if (h >= 14 && h < 17) return 'snack'
  if (h >= 17 && h < 21) return 'dinner'
  return 'midnight'
}

const GOAL_LABELS: Record<string, string> = {
  cut: '減脂', maintain: '維持體重', bulk: '增肌', performance: '運動表現',
}

export async function analyzeFood(
  input: { text?: string; imageBase64?: string },
  userCtx: UserContext,
  today: TodayTotals
): Promise<FoodAnalysis> {
  const goal = GOAL_LABELS[userCtx.goal ?? ''] ?? '維持體重'
  const mealType = detectMealType()

  const system = `你是專業營養師 AI，負責幫用戶記錄飲食並估算營養成分。

【重要規則】
1. 輸入可以是照片、文字描述、或兩者兼有——純文字描述完全足夠，不需要照片
2. 若用戶描述多種食物，合併成一筆，nutrition 加總計算
3. 必須永遠以純 JSON 回覆，不加任何說明文字或 markdown
4. 只有在完全無法判斷是什麼食物時，才回覆 {"error":"請描述得更具體"}

用戶資料：性別 ${userCtx.gender ?? '未知'}、${userCtx.age ?? '?'}歲、身高 ${userCtx.height_cm ?? '?'} cm、目標：${goal}
每日目標：熱量 ${userCtx.daily_calories ?? 2000} kcal、蛋白質 ${userCtx.daily_protein_g ?? 60}g
今日已累計：熱量 ${Math.round(today.calories)} kcal、蛋白質 ${Math.round(today.protein_g)}g

回覆格式（純 JSON，不加 markdown）：
{"food_name":"食物名稱","quantity_desc":"份量（例如：約200g、1碗）","calories":數字,"protein_g":數字,"carbs_g":數字,"fat_g":數字,"fiber_g":數字,"tip":"針對用戶目標的一句建議（40字以內）"}`

  const content: Anthropic.MessageParam['content'] = []

  if (input.imageBase64) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: input.imageBase64 },
    })
  }
  if (input.text) {
    content.push({ type: 'text', text: input.text })
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[AI] Non-JSON response:', raw.slice(0, 200))
    throw new Error('無法辨識')
  }

  if (parsed.error) throw new Error(String(parsed.error))

  return { ...parsed, meal_type: mealType } as FoodAnalysis
}

// ─── Exercise ───────────────────────────────────────────────────────────────

export interface ExerciseAnalysis {
  exercise_name: string
  duration_min: number
  intensity: 'light' | 'moderate' | 'hard' | 'very_hard'
  calories_burned: number
}

export function isExerciseEntry(text: string): boolean {
  return /跑步|慢跑|快走|健身|重訓|游泳|騎車|騎腳踏車|瑜伽|有氧|HIIT|球|爬山|走路\d|散步\d|運動了|去健身|做了.*運動|練.*分鐘|訓練.*分鐘/.test(text)
}

export async function analyzeExercise(text: string, userCtx: UserContext): Promise<ExerciseAnalysis> {
  const system = `你是運動分析 AI。根據用戶描述估算運動消耗熱量。

用戶資料：性別 ${userCtx.gender ?? '未知'}、${userCtx.age ?? '?'}歲
體重估算：${userCtx.height_cm ? Math.round((userCtx.height_cm - 100) * 0.9) : 70} kg

intensity 定義：light=散步/伸展、moderate=快走/慢跑/游泳、hard=跑步/重訓/球類、very_hard=HIIT/競技
若訊息未說明時間，預設 30 分鐘。

以純 JSON 回覆，不加 markdown：
{"exercise_name":"運動名稱","duration_min":數字,"intensity":"light|moderate|hard|very_hard","calories_burned":數字}
無法辨識則回覆：{"error":"無法辨識"}`

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    system,
    messages: [{ role: 'user', content: text }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error('[AI] Non-JSON exercise response:', raw.slice(0, 200))
    throw new Error('無法辨識')
  }

  if (parsed.error) throw new Error(String(parsed.error))
  return parsed as unknown as ExerciseAnalysis
}

// ─── Weight ──────────────────────────────────────────────────────────────────

export function isWeightEntry(text: string): boolean {
  return /體重|量體重/.test(text) && /\d+(\.\d+)?/.test(text)
}

export function extractWeightKg(text: string): number | null {
  const after = text.match(/(?:體重|量體重)[^\d]*(\d+(?:\.\d+)?)/)
  if (after) return parseFloat(after[1])
  const any = text.match(/(\d+(?:\.\d+)?)\s*(?:kg|公斤)/)
  return any ? parseFloat(any[1]) : null
}

// ─── Meal correction ─────────────────────────────────────────────────────────

export function isMealCorrection(text: string): boolean {
  return /(剛剛|上一筆|那個|最後一筆|那餐).*(是|改|算|變|要改).*(早餐|午餐|晚餐|點心|宵夜)|(早餐|午餐|晚餐|點心|宵夜).*(剛剛|上一筆|那個)/.test(text)
}

export function extractMealTypeFromCorrection(text: string): string | null {
  if (/早餐/.test(text)) return 'breakfast'
  if (/午餐/.test(text)) return 'lunch'
  if (/晚餐/.test(text)) return 'dinner'
  if (/點心|下午茶/.test(text)) return 'snack'
  if (/宵夜/.test(text)) return 'midnight'
  return null
}

// ─── Water ───────────────────────────────────────────────────────────────────

export function isWaterEntry(text: string): boolean {
  return /喝水|補水|飲水|喝了.{0,10}水|水.{0,5}(ml|毫升|杯|瓶|cc)|(\d+)\s*(ml|毫升).{0,5}水/.test(text)
}

export async function extractWaterMl(text: string): Promise<number> {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 32,
    messages: [{
      role: 'user',
      content: `從以下訊息計算總喝水量（單位 ml），只回覆數字。
換算參考：1杯≈250ml、1瓶≈500ml、1cc=1ml。若有倍數（例如「兩次800ml」）請相乘。
若無法判斷回覆 0。
訊息：${text}`,
    }],
  })
  const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '0'
  const ml = parseInt(raw.replace(/[^\d]/g, ''), 10)
  return isNaN(ml) ? 0 : ml
}
