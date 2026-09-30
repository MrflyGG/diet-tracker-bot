// v1.0.0 | 2026-09-30 | Claude AI food analysis

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

  const system = `你是專業營養師 AI。根據用戶傳來的食物照片或文字，估算營養成分並給建議。

用戶資料：性別 ${userCtx.gender ?? '未知'}、${userCtx.age ?? '?'}歲、身高 ${userCtx.height_cm ?? '?'} cm、目標：${goal}
每日目標：熱量 ${userCtx.daily_calories ?? 2000} kcal、蛋白質 ${userCtx.daily_protein_g ?? 60}g
今日已累計：熱量 ${Math.round(today.calories)} kcal、蛋白質 ${Math.round(today.protein_g)}g

以 JSON 格式回覆，不含其他文字：
{"food_name":"食物名稱","quantity_desc":"份量（例如：約200g、1碗）","calories":數字,"protein_g":數字,"carbs_g":數字,"fat_g":數字,"fiber_g":數字,"tip":"針對用戶目標的一句建議（40字以內）"}

無法辨識時回覆：{"error":"無法辨識"}`

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
  const parsed = JSON.parse(raw)

  if (parsed.error) throw new Error(parsed.error)

  return { ...parsed, meal_type: mealType }
}
