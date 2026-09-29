'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function saveProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const profile = {
    id: user.id,
    gender: formData.get('gender') as string || null,
    age: formData.get('age') ? Number(formData.get('age')) : null,
    height_cm: formData.get('height_cm') ? Number(formData.get('height_cm')) : null,
    goal: formData.get('goal') as string || 'maintain',
    daily_calories: formData.get('daily_calories') ? Number(formData.get('daily_calories')) : null,
    daily_protein_g: formData.get('daily_protein_g') ? Number(formData.get('daily_protein_g')) : null,
    daily_carbs_g: formData.get('daily_carbs_g') ? Number(formData.get('daily_carbs_g')) : null,
    daily_fat_g: formData.get('daily_fat_g') ? Number(formData.get('daily_fat_g')) : null,
    daily_fiber_g: formData.get('daily_fiber_g') ? Number(formData.get('daily_fiber_g')) : null,
    timezone: 'Asia/Taipei',
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('user_profiles').upsert(profile)
  if (error) return { error: error.message }

  revalidatePath('/settings')
  return { success: true }
}

export async function saveReminders(reminders: { type: string; enabled: boolean; time: string }[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '未登入' }

  const rows = reminders.map(r => ({
    user_id: user.id,
    reminder_type: r.type,
    enabled: r.enabled,
    time_hhmm: r.time,
  }))

  const { error } = await supabase
    .from('reminder_settings')
    .upsert(rows, { onConflict: 'user_id,reminder_type' })

  if (error) return { error: error.message }
  revalidatePath('/settings')
  return { success: true }
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
