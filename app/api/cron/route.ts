// v1.0.0 | 2026-09-30 | Phase 4: reminder cron endpoint (triggered by Supabase pg_cron)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/telegram'

function getTodayInTaipei(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

const REMINDER_MESSAGES: Record<string, string> = {
  breakfast:     '🌅 早安！記得記錄今天的早餐喔 🥣\n\n傳食物照片或文字即可記錄。',
  lunch:         '☀️ 午餐時間！記得記錄午餐 🍱\n\n傳食物照片或文字即可記錄。',
  dinner:        '🌙 晚餐時間到了，記得記錄今天的晚餐 🍽\n\n傳食物照片或文字即可記錄。',
  snack:         '🍵 下午茶時間，有吃點心嗎？記得記錄！',
  weight:        '⚖️ 量體重時間！\n\n傳送體重數字即可記錄（例如：體重 75.5）',
  water:         '💧 記得補水！今天喝夠水了嗎？\n\n傳送「喝水 500ml」即可記錄。',
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { user_id, chat_id, reminder_type } = body as {
    user_id: string
    chat_id: number
    reminder_type: string
  }

  if (!user_id || !chat_id || !reminder_type) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const today = getTodayInTaipei()

  // daily_summary: 永遠發送今日統計
  if (reminder_type === 'daily_summary') {
    const { data: entries } = await supabase
      .from('food_entries')
      .select('meal_type, food_name, calories, protein_g, carbs_g, fat_g')
      .eq('user_id', user_id)
      .eq('log_date', today)

    const { data: waterRows } = await supabase
      .from('water_entries')
      .select('amount_ml')
      .eq('user_id', user_id)
      .eq('log_date', today)

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('daily_calories, daily_protein_g')
      .eq('id', user_id)
      .maybeSingle()

    const totalCal  = Math.round(entries?.reduce((s, e) => s + (e.calories ?? 0), 0) ?? 0)
    const totalPro  = Math.round(entries?.reduce((s, e) => s + (e.protein_g ?? 0), 0) ?? 0)
    const totalCarb = Math.round(entries?.reduce((s, e) => s + (e.carbs_g ?? 0), 0) ?? 0)
    const totalFat  = Math.round(entries?.reduce((s, e) => s + (e.fat_g ?? 0), 0) ?? 0)
    const totalWater = waterRows?.reduce((s, r) => s + (r.amount_ml ?? 0), 0) ?? 0
    const targetCal = profile?.daily_calories ?? 2000
    const targetPro = profile?.daily_protein_g ?? 60
    const calPct = Math.round((totalCal / targetCal) * 100)

    const foodCount = entries?.length ?? 0
    const intro = foodCount === 0
      ? '今天還沒有飲食記錄喔！'
      : `今天共記錄了 ${foodCount} 筆飲食。`

    const msg = `📊 <b>今日飲食總結</b>\n\n${intro}\n\n🔥 熱量：${totalCal} / ${targetCal} kcal（${calPct}%）\n💪 蛋白質：${totalPro}g / ${targetPro}g\n🌾 碳水：${totalCarb}g\n🥑 脂肪：${totalFat}g\n💧 喝水：${totalWater} ml\n\n晚安，明天繼續加油！ 🌙`

    await sendMessage(chat_id, msg)
    return NextResponse.json({ ok: true })
  }

  // 其他提醒：先查是否已記錄
  let alreadyRecorded = false

  if (['breakfast', 'lunch', 'dinner', 'snack'].includes(reminder_type)) {
    const { data } = await supabase
      .from('food_entries')
      .select('id')
      .eq('user_id', user_id)
      .eq('log_date', today)
      .eq('meal_type', reminder_type)
      .limit(1)
      .maybeSingle()
    alreadyRecorded = !!data
  } else if (reminder_type === 'water') {
    const { data } = await supabase
      .from('water_entries')
      .select('amount_ml')
      .eq('user_id', user_id)
      .eq('log_date', today)
    const total = data?.reduce((s, r) => s + (r.amount_ml ?? 0), 0) ?? 0
    alreadyRecorded = total >= 500
  }
  // weight: 永遠發送（體重記錄功能尚未實作）

  if (alreadyRecorded) {
    console.log(`[CRON] skip ${reminder_type} for ${user_id} — already recorded`)
    return NextResponse.json({ ok: true, skipped: true })
  }

  const msg = REMINDER_MESSAGES[reminder_type]
  if (msg) {
    await sendMessage(chat_id, msg)
    console.log(`[CRON] sent ${reminder_type} reminder to chat ${chat_id}`)
  }

  return NextResponse.json({ ok: true })
}
