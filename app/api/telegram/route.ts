import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMessage } from '@/lib/telegram'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const message = body.message
  if (!message?.text) return NextResponse.json({ ok: true })

  const chatId = message.chat.id
  const telegramUserId: number = message.from.id
  const telegramUsername: string | undefined = message.from.username
  const text: string = message.text.trim()

  const supabase = createAdminClient()

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

    // /start without token
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

  if (text === '/help') {
    await sendMessage(
      chatId,
      '📋 <b>可用指令</b>\n\n/help — 顯示此說明\n\n🚧 飲食記錄、運動、喝水等功能即將在下個版本上線！'
    )
    return NextResponse.json({ ok: true })
  }

  // 其他訊息
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
  } else {
    await sendMessage(chatId, '🚧 功能開發中，敬請期待！\n\n傳送 /help 查看說明。')
  }

  return NextResponse.json({ ok: true })
}
