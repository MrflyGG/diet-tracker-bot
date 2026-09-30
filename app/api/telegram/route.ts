// v1.4.0 | 2026-09-30 | add weight / exercise / meal-correction / water in query

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage, getFileUrl } from '@/lib/telegram'
import {
  analyzeFood, isWaterEntry, extractWaterMl,
  isWeightEntry, extractWeightKg,
  isExerciseEntry, analyzeExercise,
  isMealCorrection, extractMealTypeFromCorrection,
} from '@/lib/claude'

const MEAL_LABELS: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '下午點心', midnight: '宵夜',
}

const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍵', midnight: '🌃',
}

function getTodayInTaipei(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
}

function isQuery(text: string): boolean {
  return /多少|總共|統計|查詢|今天吃|紀錄|記錄了|熱量.*今|今.*熱量|吃了什麼|summary|total/i.test(text)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const message = body.message
  if (!message) return NextResponse.json({ ok: true })

  const chatId: number = message.chat.id
  const telegramUserId: number = message.from.id
  const telegramUsername: string | undefined = message.from.username
  const text: string = message.text?.trim() ?? ''
  const photo = message.photo as { file_id: string }[] | undefined
  const caption: string = message.caption?.trim() ?? ''

  if (!text && !photo) return NextResponse.json({ ok: true })

  const supabase = createAdminClient()

  // /start — 帳號綁定
  if (text.startsWith('/start')) {
    const token = text.split(' ')[1]

    if (token) {
      const { data: bindToken } = await supabase
        .from('telegram_bind_tokens')
        .select('user_id, expires_at')
        .eq('token', token)
        .single()

      if (!bindToken) {
        await sendMessage(chatId, '❌ 綁定碼無效或已過期，請回設定頁重新產生。')
        return NextResponse.json({ ok: true })
      }

      if (new Date(bindToken.expires_at) < new Date()) {
        await supabase.from('telegram_bind_tokens').delete().eq('token', token)
        await sendMessage(chatId, '❌ 綁定碼已過期（15 分鐘），請回設定頁重新產生。')
        return NextResponse.json({ ok: true })
      }

      const { error } = await supabase.from('telegram_links').upsert(
        {
          user_id: bindToken.user_id,
          telegram_user_id: telegramUserId,
          telegram_username: telegramUsername ?? null,
          linked_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_user_id' }
      )

      await supabase.from('telegram_bind_tokens').delete().eq('token', token)

      if (error) {
        await sendMessage(chatId, '❌ 綁定失敗，請稍後再試。')
      } else {
        await sendMessage(
          chatId,
          '✅ 帳號綁定成功！\n\n從現在起，這裡就是你的飲食追蹤小基地 🥗\n\n傳送 /help 看看有哪些功能。'
        )
      }
      return NextResponse.json({ ok: true })
    }

    const { data: link } = await supabase
      .from('telegram_links')
      .select('user_id')
      .eq('telegram_user_id', telegramUserId)
      .maybeSingle()

    if (link) {
      await sendMessage(chatId, '👋 你已經綁定帳號了！\n\n傳送 /help 查看可用功能。')
    } else {
      await sendMessage(
        chatId,
        '👋 哈囉！我是飲食追蹤小幫手 🥗\n\n請先到設定頁完成帳號綁定：\n➡️ https://diet-tracker-bot-nine.vercel.app/settings'
      )
    }
    return NextResponse.json({ ok: true })
  }

  // /help
  if (text === '/help') {
    await sendMessage(
      chatId,
      '📋 <b>使用說明</b>\n\n🍱 <b>記錄飲食</b>\n直接傳食物照片，或輸入文字\n例如：「滷肉飯一碗」、「雞胸肉 150g + 花椰菜」\n\n💧 <b>記錄喝水</b>\n例如：「喝水 500ml」、「喝了兩杯水」\n\n📊 <b>查詢今日</b>\n輸入「今天吃了多少」或「統計」\n\n⚙️ <b>個人設定</b>（提醒時間、每日目標）\nhttps://diet-tracker-bot-nine.vercel.app/settings\n\n/help — 顯示此說明',
    )
    return NextResponse.json({ ok: true })
  }

  // 確認帳號已綁定
  const { data: link } = await supabase
    .from('telegram_links')
    .select('user_id')
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle()

  if (!link) {
    await sendMessage(
      chatId,
      '請先完成帳號綁定 👆\n\n➡️ https://diet-tracker-bot-nine.vercel.app/settings'
    )
    return NextResponse.json({ ok: true })
  }

  const userId = link.user_id
  const today = getTodayInTaipei()

  // 查詢今日累計
  if (text && isQuery(text) && !photo) {
    const [{ data: entries }, { data: waterRows }, { data: profile }] = await Promise.all([
      supabase.from('food_entries')
        .select('meal_type, food_name, calories, protein_g, carbs_g, fat_g')
        .eq('user_id', userId).eq('log_date', today).order('created_at'),
      supabase.from('water_entries')
        .select('amount_ml').eq('user_id', userId).eq('log_date', today),
      supabase.from('user_profiles')
        .select('daily_calories, daily_protein_g, daily_water_ml').eq('id', userId).maybeSingle(),
    ])

    const totalWater = waterRows?.reduce((s, r) => s + (r.amount_ml ?? 0), 0) ?? 0

    if (!entries || entries.length === 0) {
      const waterLine = totalWater > 0 ? `\n\n💧 喝水：${totalWater} ml` : ''
      await sendMessage(chatId, `📊 今天（${today}）還沒有飲食紀錄。${waterLine}\n\n傳食物照片或文字開始記錄吧！`)
      return NextResponse.json({ ok: true })
    }

    const totalCal = Math.round(entries.reduce((s, e) => s + (e.calories ?? 0), 0))
    const totalPro = Math.round(entries.reduce((s, e) => s + (e.protein_g ?? 0), 0))
    const totalCarb = Math.round(entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0))
    const totalFat = Math.round(entries.reduce((s, e) => s + (e.fat_g ?? 0), 0))
    const targetCal = profile?.daily_calories ?? 2000
    const targetPro = profile?.daily_protein_g ?? 60
    const targetWater = profile?.daily_water_ml ?? 2000
    const calPct = Math.round((totalCal / targetCal) * 100)
    const proPct = Math.round((totalPro / targetPro) * 100)
    const waterPct = Math.round((totalWater / targetWater) * 100)

    const lines = entries.map(e =>
      `${MEAL_ICONS[e.meal_type ?? ''] ?? '🍽'} ${MEAL_LABELS[e.meal_type ?? ''] ?? ''} ${e.food_name} — ${Math.round(e.calories ?? 0)} kcal`
    )

    const reply = `📊 <b>今日飲食紀錄（${today}）</b>\n\n${lines.join('\n')}\n\n📈 <b>今日累計</b>\n熱量：${totalCal} / ${targetCal} kcal（${calPct}%）\n蛋白質：${totalPro}g / ${targetPro}g（${proPct}%）\n碳水：${totalCarb}g｜脂肪：${totalFat}g\n💧 喝水：${totalWater} / ${targetWater} ml（${waterPct}%）`

    await sendMessage(chatId, reply)
    return NextResponse.json({ ok: true })
  }

  // 喝水記錄
  if (text && isWaterEntry(text) && !photo) {
    try {
      const ml = await extractWaterMl(text)
      if (ml <= 0) {
        await sendMessage(chatId, '💧 請說明喝了多少水，例如：「喝水 500ml」或「喝了兩杯水」。')
        return NextResponse.json({ ok: true })
      }

      const { error: dbErr } = await supabase.from('water_entries').insert({
        user_id: userId,
        log_date: today,
        amount_ml: ml,
      })

      if (dbErr) throw new Error(dbErr.message)

      // 今日喝水總量
      const { data: waterRows } = await supabase
        .from('water_entries')
        .select('amount_ml')
        .eq('user_id', userId)
        .eq('log_date', today)

      const totalMl = (waterRows?.reduce((s, r) => s + (r.amount_ml ?? 0), 0) ?? 0)
      const cups = Math.round(totalMl / 250)

      await sendMessage(chatId, `💧 喝水記錄成功！+${ml} ml\n\n今日累計：${totalMl} ml（約 ${cups} 杯）\n\n建議每日飲水 2000ml 以上。`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[DB] water_entries insert error:', msg)
      await sendMessage(chatId, `⚠️ 喝水記錄失敗，請稍後再試。\n\n${msg}`)
    }
    return NextResponse.json({ ok: true })
  }

  // 體重記錄
  if (text && isWeightEntry(text) && !photo) {
    const kg = extractWeightKg(text)
    if (!kg || kg < 20 || kg > 300) {
      await sendMessage(chatId, '⚖️ 請輸入體重數字，例如：「體重 75.5」或「量體重 68kg」。')
      return NextResponse.json({ ok: true })
    }

    const yesterday = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10)
    const { data: prevLog } = await supabase
      .from('daily_logs').select('weight_kg').eq('user_id', userId).eq('log_date', yesterday).maybeSingle()

    const { error: dbErr } = await supabase.from('daily_logs').upsert(
      { user_id: userId, log_date: today, weight_kg: kg },
      { onConflict: 'user_id,log_date' }
    )

    if (dbErr) {
      console.error('[DB] daily_logs upsert error:', dbErr.message)
      await sendMessage(chatId, `⚠️ 體重記錄失敗，請稍後再試。`)
      return NextResponse.json({ ok: true })
    }

    let diffLine = ''
    if (prevLog?.weight_kg) {
      const diff = Math.round((kg - prevLog.weight_kg) * 10) / 10
      diffLine = diff > 0 ? `\n較昨日：+${diff} kg` : diff < 0 ? `\n較昨日：${diff} kg` : '\n較昨日：持平'
    }

    await sendMessage(chatId, `⚖️ 體重記錄成功！\n\n今日體重：${kg} kg${diffLine}`)
    return NextResponse.json({ ok: true })
  }

  // 餐別修正
  if (text && isMealCorrection(text) && !photo) {
    const newMealType = extractMealTypeFromCorrection(text)
    if (!newMealType) {
      await sendMessage(chatId, '🤔 請說明要改成哪一餐（早餐、午餐、晚餐、點心或宵夜）。')
      return NextResponse.json({ ok: true })
    }

    const { data: latest } = await supabase
      .from('food_entries').select('id, food_name, meal_type')
      .eq('user_id', userId).eq('log_date', today)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (!latest) {
      await sendMessage(chatId, '🤔 今天還沒有飲食記錄，無法修正。')
      return NextResponse.json({ ok: true })
    }

    const { error: dbErr } = await supabase
      .from('food_entries').update({ meal_type: newMealType }).eq('id', latest.id)

    if (dbErr) {
      console.error('[DB] food_entries update error:', dbErr.message)
      await sendMessage(chatId, `⚠️ 修正失敗，請稍後再試。`)
      return NextResponse.json({ ok: true })
    }

    const oldLabel = MEAL_LABELS[latest.meal_type ?? ''] ?? latest.meal_type
    const newLabel = MEAL_LABELS[newMealType] ?? newMealType
    await sendMessage(chatId, `✅ 已將「${latest.food_name}」從 ${oldLabel} 改為 ${newLabel}。`)
    return NextResponse.json({ ok: true })
  }

  // 運動記錄
  if (text && isExerciseEntry(text) && !photo) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles').select('gender, age, height_cm').eq('id', userId).maybeSingle()

      const analysis = await analyzeExercise(text, profile ?? {})

      const { error: dbErr } = await supabase.from('exercise_entries').insert({
        user_id: userId,
        log_date: today,
        exercise_name: analysis.exercise_name,
        duration_min: analysis.duration_min,
        intensity: analysis.intensity,
        calories_burned: analysis.calories_burned,
      })

      if (dbErr) throw new Error(dbErr.message)

      const intensityLabel: Record<string, string> = {
        light: '輕度', moderate: '中度', hard: '高強度', very_hard: '極高強度',
      }

      await sendMessage(chatId, `🏃 運動記錄成功！\n\n🏋️ ${analysis.exercise_name}\n⏱ ${analysis.duration_min} 分鐘｜${intensityLabel[analysis.intensity] ?? analysis.intensity}\n🔥 消耗約 ${analysis.calories_burned} kcal`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[AI] analyzeExercise error:', msg)
      if (msg === '無法辨識') {
        await sendMessage(chatId, '🤔 無法辨識運動內容，請補充說明（例如：「跑步 30 分鐘」）。')
      } else {
        await sendMessage(chatId, `⚠️ 運動記錄失敗，請稍後再試。`)
      }
    }
    return NextResponse.json({ ok: true })
  }

  // 食物分析（照片或文字）
  try {
    // 取得用戶個人資料
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('gender, age, height_cm, goal, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g')
      .eq('id', userId)
      .maybeSingle()

    // 今日累計
    const { data: todayEntries } = await supabase
      .from('food_entries')
      .select('calories, protein_g')
      .eq('user_id', userId)
      .eq('log_date', today)

    const todayTotals = {
      calories: todayEntries?.reduce((s, e) => s + (e.calories ?? 0), 0) ?? 0,
      protein_g: todayEntries?.reduce((s, e) => s + (e.protein_g ?? 0), 0) ?? 0,
    }

    // 下載圖片（若有）
    let imageBase64: string | undefined
    if (photo) {
      const largest = photo[photo.length - 1]
      const fileUrl = await getFileUrl(largest.file_id)
      const imgRes = await fetch(fileUrl)
      const buf = await imgRes.arrayBuffer()
      imageBase64 = Buffer.from(buf).toString('base64')
    }

    // 呼叫 Claude 分析
    const analysis = await analyzeFood(
      { text: text || caption || undefined, imageBase64 },
      profile ?? {},
      todayTotals
    )

    // 寫入 food_entries
    const { error: dbErr } = await supabase.from('food_entries').insert({
      user_id: userId,
      log_date: today,
      meal_type: analysis.meal_type,
      food_name: analysis.food_name,
      quantity_desc: analysis.quantity_desc,
      calories: analysis.calories,
      protein_g: analysis.protein_g,
      carbs_g: analysis.carbs_g,
      fat_g: analysis.fat_g,
      fiber_g: analysis.fiber_g,
      is_estimated: true,
      source: photo ? 'photo' : 'ai',
    })

    if (dbErr) {
      console.error('[DB] food_entries insert error:', dbErr.message)
      throw new Error('DB 寫入失敗')
    }

    // 回覆摘要
    const newCal = Math.round(todayTotals.calories + analysis.calories)
    const newPro = Math.round(todayTotals.protein_g + analysis.protein_g)
    const targetCal = profile?.daily_calories ?? 2000
    const targetPro = profile?.daily_protein_g ?? 60

    const reply = `🍱 記錄成功！

📌 ${MEAL_LABELS[analysis.meal_type]}

🍽 ${analysis.food_name}（${analysis.quantity_desc}）
熱量 ${Math.round(analysis.calories)} kcal
蛋白質 ${Math.round(analysis.protein_g)}g｜碳水 ${Math.round(analysis.carbs_g)}g｜脂肪 ${Math.round(analysis.fat_g)}g

📊 今日累計：${newCal} / ${targetCal} kcal
蛋白質 ${newPro}g / ${targetPro}g

💬 ${analysis.tip}`

    await sendMessage(chatId, reply)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[AI] analyzeFood error:', msg)

    if (msg === '無法辨識') {
      await sendMessage(chatId, '🤔 看不清楚這是什麼食物，請補充文字描述（例如：「滷肉飯一碗」）。')
    } else if (msg.includes('credit') || msg.includes('billing') || msg.includes('402')) {
      await sendMessage(chatId, '⚠️ AI 分析服務暫時無法使用（API 餘額不足）。')
    } else if (msg.includes('429') || msg.includes('rate_limit')) {
      await sendMessage(chatId, '⚠️ 請求太頻繁，請稍後再試。')
    } else {
      await sendMessage(chatId, `⚠️ 發生錯誤，請稍後重試。\n\n${msg}`)
    }
  }

  return NextResponse.json({ ok: true })
}
