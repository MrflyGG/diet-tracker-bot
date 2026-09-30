'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveProfile, saveReminders, signOut, createBindToken } from './actions'

const REMINDER_TYPES = [
  { type: 'weight', label: '⚖️ 早晨體重', defaultTime: '07:00' },
  { type: 'breakfast', label: '🍳 早餐提醒', defaultTime: '08:00' },
  { type: 'lunch', label: '🍱 午餐提醒', defaultTime: '12:00' },
  { type: 'dinner', label: '🍽️ 晚餐提醒', defaultTime: '18:30' },
  { type: 'daily_summary', label: '📊 每日總結', defaultTime: '22:00' },
]

type Profile = Record<string, string | number | null> | null
type ReminderRow = { reminder_type: string; enabled: boolean; time_hhmm: string }
type TelegramLink = { telegram_username: string | null } | null

function getReminderDefault(reminders: ReminderRow[], type: string, defaultTime: string) {
  const found = reminders.find(r => r.reminder_type === type)
  return { enabled: found?.enabled ?? true, time: found?.time_hhmm ?? defaultTime }
}

export default function SettingsForm({
  email,
  profile,
  reminders,
  telegramLink,
}: {
  email: string
  profile: Profile
  reminders: ReminderRow[]
  telegramLink: TelegramLink
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [bindState, setBindState] = useState<'idle' | 'loading' | 'opened'>('idle')

  const [reminderState, setReminderState] = useState(
    REMINDER_TYPES.map(rt => ({
      ...rt,
      ...getReminderDefault(reminders, rt.type, rt.defaultTime),
    }))
  )

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const [profileResult, reminderResult] = await Promise.all([
        saveProfile(formData),
        saveReminders(reminderState.map(r => ({ type: r.type, enabled: r.enabled, time: r.time }))),
      ])
      if (profileResult.error || reminderResult?.error) {
        setError(profileResult.error ?? reminderResult?.error ?? '儲存失敗')
      } else {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    })
  }

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  const handleBind = async () => {
    setBindState('loading')
    setError('')
    const result = await createBindToken()
    if ('error' in result && result.error) {
      setError(result.error)
      setBindState('idle')
      return
    }
    if ('token' in result && result.token && result.botUsername) {
      window.open(`https://t.me/${result.botUsername}?start=${result.token}`, '_blank')
      setBindState('opened')
    }
  }

  const p = profile as Record<string, string | number | null> | null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">🥗 個人設定</h1>
          <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-600">
            登出
          </button>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* 帳號 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">帳號</h2>
          <p className="text-gray-700 text-sm">{email}</p>
          <div className="mt-3 p-3 bg-blue-50 rounded-xl text-sm">
            <p className="font-medium text-blue-800 mb-2">📱 Telegram 綁定</p>
            {telegramLink ? (
              <p className="text-green-700 font-medium">
                ✅ 已綁定{telegramLink.telegram_username ? ` @${telegramLink.telegram_username}` : ''}
              </p>
            ) : bindState === 'opened' ? (
              <div className="space-y-2">
                <p className="text-blue-700">Telegram 已開啟，完成綁定後點下方按鈕確認</p>
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg"
                >
                  重新整理確認
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleBind}
                disabled={bindState === 'loading'}
                className="bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {bindState === 'loading' ? '產生中...' : '綁定 Telegram'}
              </button>
            )}
          </div>
        </div>

        {/* 個人資料 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">個人資料</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
              <select name="gender" defaultValue={p?.gender as string ?? ''} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">未設定</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年齡</label>
              <input type="number" name="age" defaultValue={p?.age as number ?? ''} placeholder="25" min="10" max="100" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">身高 (cm)</label>
              <input type="number" name="height_cm" defaultValue={p?.height_cm as number ?? ''} placeholder="170" min="100" max="250" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標</label>
              <select name="goal" defaultValue={p?.goal as string ?? 'maintain'} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="cut">減脂</option>
                <option value="maintain">維持</option>
                <option value="bulk">增肌</option>
                <option value="performance">運動表現</option>
              </select>
            </div>
          </div>
        </div>

        {/* 每日目標 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">每日目標</h2>
          <p className="text-xs text-gray-400">由教練設定者請填入，否則可暫時留空（AI 將估算）</p>

          <div className="grid grid-cols-2 gap-4">
            {[
              { name: 'daily_calories', label: '🔥 熱量 (kcal)', placeholder: '2000' },
              { name: 'daily_protein_g', label: '🥩 蛋白質 (g)', placeholder: '150' },
              { name: 'daily_carbs_g', label: '🍚 碳水 (g)', placeholder: '200' },
              { name: 'daily_fat_g', label: '🥑 脂肪 (g)', placeholder: '65' },
              { name: 'daily_fiber_g', label: '🌿 纖維 (g)', placeholder: '25' },
              { name: 'daily_water_ml', label: '💧 喝水目標 (ml)', placeholder: '2000' },
            ].map(field => (
              <div key={field.name}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                <input
                  type="number"
                  name={field.name}
                  defaultValue={p?.[field.name] as number ?? ''}
                  placeholder={field.placeholder}
                  min="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                />
              </div>
            ))}
          </div>
        </div>

        {/* 提醒設定 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">提醒設定</h2>

          {reminderState.map((r, i) => (
            <div key={r.type} className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setReminderState(prev => prev.map((item, idx) => idx === i ? { ...item, enabled: !item.enabled } : item))}
                className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${r.enabled ? 'bg-green-500' : 'bg-gray-200'}`}
              >
                <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${r.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700 flex-1">{r.label}</span>
              <input
                type="time"
                value={r.time}
                onChange={(e) => setReminderState(prev => prev.map((item, idx) => idx === i ? { ...item, time: e.target.value } : item))}
                disabled={!r.enabled}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-40"
              />
            </div>
          ))}
        </div>

        {/* 儲存 */}
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        {saved && <p className="text-green-600 text-sm text-center font-medium">✓ 已儲存</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-green-500 text-white rounded-2xl py-4 font-semibold text-base hover:bg-green-600 disabled:opacity-50 transition-colors"
        >
          {isPending ? '儲存中...' : '儲存設定'}
        </button>
      </form>
    </div>
  )
}
