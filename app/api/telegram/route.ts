// v1.1.0 | 2026-09-30 | Phase 3: AI food analysis (photo + text)

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage, getFileUrl } from '@/lib/telegram'
import { analyzeFood } from '@/lib/claude'

const MEAL_LABELS: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '下午點心', midnight: '宵夜',
}

function getTodayInTaipei(): string {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
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
      '📋 <b>使用說明</b>\n\n🍱 <b>記錄飲食</b>\n直接傳食物照片，或輸入文字\n例如：「滷肉飯一碗」、「雞胸肉 150g + 花椰菜」\n\n/help — 顯示此說明\n\n🚧 即將推出：運動記錄、喝水追蹤、提醒設定',
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

  // 食物分析（照片或文字）
  try {
    // 取得用戶個人資料
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('gender, age, height_cm, goal, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g')
      .eq('id', userId)
      .maybeSingle()

    // 今日累計
    const today = getTodayInTaipei()
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
