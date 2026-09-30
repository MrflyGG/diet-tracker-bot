// v1.0.0 | 2026-09-30 | pure math helpers for daily goal calculation

export interface DailyGoalSuggestion {
  daily_calories: number
  daily_protein_g: number
  daily_carbs_g: number
  daily_fat_g: number
  daily_water_ml: number
  daily_deficit: number
  days_left: number
}

export function calcDailyGoals(
  bmr: number,
  leanMassKg: number,
  goalFatLossKg: number,
  goalDeadline: string
): DailyGoalSuggestion {
  const msLeft = new Date(goalDeadline).getTime() - Date.now()
  const daysLeft = Math.max(30, Math.round(msLeft / 86400000))
  const daily_deficit = Math.min(700, Math.round((goalFatLossKg * 7700) / daysLeft))
  const tdee = Math.round(bmr * 1.4)
  const daily_calories = Math.max(1500, tdee - daily_deficit)
  const daily_protein_g = Math.round(Math.max(120, leanMassKg * 2.0))
  const daily_fat_g = Math.round((daily_calories * 0.25) / 9)
  const daily_carbs_g = Math.max(50, Math.round((daily_calories - daily_protein_g * 4 - daily_fat_g * 9) / 4))
  const daily_water_ml = Math.round((2000 + leanMassKg * 10) / 100) * 100
  return { daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, daily_water_ml, daily_deficit, days_left: daysLeft }
}
