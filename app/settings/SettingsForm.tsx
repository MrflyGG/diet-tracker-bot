'use client'

// v2.0.0 | 2026-09-30 | 重設計：加 InBody 摘要、目標設定、AI 建議每日目標、補喝水/點心提醒

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveProfile, saveReminders, signOut, createBindToken } from './actions'
import { calcDailyGoals } from '@/lib/nutrition'

const REMINDER_TYPES = [
  { type: 'weight',        label: '⚖️ 早晨體重',  defaultTime: '07:00' },
  { type: 'breakfast',     label: '🍳 早餐提醒',  defaultTime: '08:00' },
  { type: 'lunch',         label: '🍱 午餐提醒',  defaultTime: '12:00' },
  { type: 'snack',         label: '🍵 下午點心',  defaultTime: '15:00' },
  { type: 'dinner',        label: '🍽️ 晚餐提醒', defaultTime: '18:30' },
  { type: 'water',         label: '💧 喝水提醒',  defaultTime: '10:00' },
  { type: 'daily_summary', label: '📊 每日總結',  defaultTime: '22:00' },
]

type Profile = Record<string, string | number | null> | null
type ReminderRow = { reminder_type: string; enabled: boolean; time_hhmm: string }
type TelegramLink = { telegram_username: string | null } | null
type InBodyRecord = Record<string, number | string | null> | null

function getReminderDefault(reminders: ReminderRow[], type: string, defaultTime: string) {
  const found = reminders.find(r => r.reminder_type === type)
  return { enabled: found?.enabled ?? true, time: found?.time_hhmm ?? defaultTime }
}

export default function SettingsForm({
  email, profile, reminders, telegramLink, latestInBody,
}: {
  email: string
  profile: Profile
  reminders: ReminderRow[]
  telegramLink: TelegramLink
  latestInBody: InBodyRecord
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [bindState, setBindState] = useState<'idle' | 'loading' | 'opened'>('idle')

  const p = profile as Record<string, string | number | null> | null
  const ib = latestInBody as Record<string, number | string | null> | null

  // 個人資料（controlled，避免 iOS defaultValue 灰字問題）
  const [gender, setGender]     = useState<string>(p?.gender != null ? String(p.gender) : '')
  const [age, setAge]           = useState<string>(p?.age != null ? String(p.age) : '')
  const [heightCm, setHeightCm] = useState<string>(p?.height_cm != null ? String(p.height_cm) : '')
  const [goal, setGoal]         = useState<string>(p?.goal != null ? String(p.goal) : 'cut')

  // 目標設定
  const [goalFatLoss, setGoalFatLoss] = useState<string>(p?.goal_fat_loss_kg != null ? String(p.goal_fat_loss_kg) : '')
  const [goalDeadline, setGoalDeadline] = useState<string>(p?.goal_deadline ? String(p.goal_deadline) : '')

  // 每日目標（可 override）
  const [dailyCalories, setDailyCalories] = useState<string>(p?.daily_calories != null ? String(p.daily_calories) : '')
  const [dailyProtein, setDailyProtein]   = useState<string>(p?.daily_protein_g != null ? String(p.daily_protein_g) : '')
  const [dailyCarbs, setDailyCarbs]       = useState<string>(p?.daily_carbs_g != null ? String(p.daily_carbs_g) : '')
  const [dailyFat, setDailyFat]           = useState<string>(p?.daily_fat_g != null ? String(p.daily_fat_g) : '')
  const [dailyFiber, setDailyFiber]       = useState<string>(p?.daily_fiber_g != null ? String(p.daily_fiber_g) : '')
  const [dailyWater, setDailyWater]       = useState<string>(p?.daily_water_ml != null ? String(p.daily_water_ml) : '')
  const [aiCalced, setAiCalced]           = useState(false)

  const [reminderState, setReminderState] = useState(
    REMINDER_TYPES.map(rt => ({ ...rt, ...getReminderDefault(reminders, rt.type, rt.defaultTime) }))
  )

  const handleCalcGoals = () => {
    if (!ib || !goalFatLoss || !goalDeadline) return
    const bmr = Number(ib.bmr)
    const lean = Number(ib.lean_mass_kg)
    if (!bmr || !lean) return
    const goals = calcDailyGoals(bmr, lean, parseFloat(goalFatLoss), goalDeadline)
    setDailyCalories(String(goals.daily_calories))
    setDailyProtein(String(goals.daily_protein_g))
    setDailyCarbs(String(goals.daily_carbs_g))
    setDailyFat(String(goals.daily_fat_g))
    setDailyWater(String(goals.daily_water_ml))
    setAiCalced(true)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setSaved(false)
    const formData = new FormData(e.currentTarget)
    // inject all state-controlled values
    formData.set('gender', gender)
    formData.set('age', age)
    formData.set('height_cm', heightCm)
    formData.set('goal', goal)
    formData.set('daily_calories', dailyCalories)
    formData.set('daily_protein_g', dailyProtein)
    formData.set('daily_carbs_g', dailyCarbs)
    formData.set('daily_fat_g', dailyFat)
    formData.set('daily_fiber_g', dailyFiber)
    formData.set('daily_water_ml', dailyWater)
    formData.set('goal_fat_loss_kg', goalFatLoss)
    formData.set('goal_deadline', goalDeadline)

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
    if ('error' in result && result.error) { setError(result.error); setBindState('idle'); return }
    if ('token' in result && result.token && result.botUsername) {
      window.open(`https://t.me/${result.botUsername}?start=${result.token}`, '_blank')
      setBindState('opened')
    }
  }

  const canCalcGoals = !!ib && !!goalFatLoss && !!goalDeadline

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">🥗 個人設定</h1>
          <button onClick={handleSignOut} className="text-sm text-gray-400 hover:text-gray-600">登出</button>
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
              <p className="text-green-700 font-medium">✅ 已綁定{telegramLink.telegram_username ? ` @${telegramLink.telegram_username}` : ''}</p>
            ) : bindState === 'opened' ? (
              <div className="space-y-2">
                <p className="text-blue-700">Telegram 已開啟，完成綁定後點下方按鈕確認</p>
                <button type="button" onClick={() => router.refresh()} className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg">重新整理確認</button>
              </div>
            ) : (
              <button type="button" onClick={handleBind} disabled={bindState === 'loading'}
                className="bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors">
                {bindState === 'loading' ? '產生中...' : '綁定 Telegram'}
              </button>
            )}
          </div>
        </div>

        {/* 最新 InBody */}
        {ib && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">最新 InBody</h2>
              <span className="text-xs text-gray-400">{String(ib.log_date)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">體重</p>
                <p className="text-lg font-bold text-gray-900">{ib.weight_kg}<span className="text-xs font-normal text-gray-400"> kg</span></p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">體脂</p>
                <p className="text-lg font-bold text-orange-600">{ib.pbf}<span className="text-xs font-normal text-gray-400">%</span></p>
                <p className="text-xs text-gray-400">{ib.fat_kg} kg</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">肌肉</p>
                <p className="text-lg font-bold text-green-600">{ib.muscle_kg}<span className="text-xs font-normal text-gray-400"> kg</span></p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
              <span>BMI {ib.bmi}｜BMR {ib.bmr} kcal｜內臟脂肪 {ib.visceral_fat_level}</span>
              <span className="font-medium text-green-600">評分 {ib.score}</span>
            </div>
            <p className="text-xs text-gray-400 mt-2">Telegram 傳 InBody 照片並加上說明「inbody」即可更新</p>
          </div>
        )}

        {/* 個人資料 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">個人資料</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">性別</label>
              <select value={gender} onChange={e => setGender(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="">未設定</option>
                <option value="male">男</option>
                <option value="female">女</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">年齡</label>
              <input type="number" value={age} onChange={e => setAge(e.target.value)} placeholder="25" min="10" max="100" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">身高 (cm)</label>
              <input type="number" value={heightCm} onChange={e => setHeightCm(e.target.value)} placeholder="170" min="100" max="250" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標類型</label>
              <select value={goal} onChange={e => setGoal(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                <option value="cut">減脂</option>
                <option value="maintain">維持</option>
                <option value="bulk">增肌</option>
                <option value="performance">運動表現</option>
              </select>
            </div>
          </div>
        </div>

        {/* 目標設定 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">目標設定</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">目標減脂量 (kg)</label>
              <input type="number" value={goalFatLoss} onChange={e => { setGoalFatLoss(e.target.value); setAiCalced(false) }}
                placeholder="6.8" step="0.1" min="0.5" max="50"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">截止日期</label>
              <input type="date" value={goalDeadline} onChange={e => { setGoalDeadline(e.target.value); setAiCalced(false) }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            </div>
          </div>
          <button type="button" onClick={handleCalcGoals} disabled={!canCalcGoals}
            className="w-full bg-blue-50 text-blue-600 rounded-xl py-2.5 text-sm font-medium hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            🤖 根據 InBody 計算每日建議目標
          </button>
          {!ib && <p className="text-xs text-gray-400 text-center">需先在 Telegram 傳送 InBody 照片</p>}
        </div>

        {/* 每日目標 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">每日目標</h2>
            {aiCalced && <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">🤖 AI 計算</span>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: '🔥 熱量 (kcal)', val: dailyCalories, set: setDailyCalories, ph: '2000' },
              { label: '🥩 蛋白質 (g)',  val: dailyProtein,  set: setDailyProtein,  ph: '150' },
              { label: '🍚 碳水 (g)',     val: dailyCarbs,    set: setDailyCarbs,    ph: '200' },
              { label: '🥑 脂肪 (g)',     val: dailyFat,      set: setDailyFat,      ph: '65' },
              { label: '🌿 纖維 (g)',     val: dailyFiber,    set: setDailyFiber,    ph: '25' },
              { label: '💧 喝水 (ml)',    val: dailyWater,    set: setDailyWater,    ph: '2000' },
            ].map(f => (
              <div key={f.label}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input type="number" value={f.val} onChange={e => { f.set(e.target.value); setAiCalced(false) }}
                  placeholder={f.ph} min="0"
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 ${aiCalced ? 'border-blue-200 bg-blue-50' : 'border-gray-200'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* 提醒設定 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-1">提醒設定</h2>
          {reminderState.map((r, i) => (
            <div key={r.type} className="flex items-center gap-3">
              <button type="button"
                onClick={() => setReminderState(prev => prev.map((item, idx) => idx === i ? { ...item, enabled: !item.enabled } : item))}
                className={`w-10 h-6 rounded-full transition-colors flex-shrink-0 ${r.enabled ? 'bg-green-500' : 'bg-gray-200'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${r.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
              <span className="text-sm text-gray-700 flex-1">{r.label}</span>
              <input type="time" value={r.time}
                onChange={e => setReminderState(prev => prev.map((item, idx) => idx === i ? { ...item, time: e.target.value } : item))}
                disabled={!r.enabled}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 disabled:opacity-40" />
            </div>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        {saved && <p className="text-green-600 text-sm text-center font-medium">✓ 已儲存</p>}
        <button type="submit" disabled={isPending}
          className="w-full bg-green-500 text-white rounded-2xl py-4 font-semibold text-base hover:bg-green-600 disabled:opacity-50 transition-colors">
          {isPending ? '儲存中...' : '儲存設定'}
        </button>
      </form>
    </div>
  )
}
