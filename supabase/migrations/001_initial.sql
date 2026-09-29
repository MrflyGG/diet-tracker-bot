-- user_profiles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  age INTEGER,
  height_cm NUMERIC(5,1),
  goal TEXT DEFAULT 'maintain' CHECK (goal IN ('cut', 'maintain', 'bulk', 'performance')),
  daily_calories INTEGER,
  daily_protein_g INTEGER,
  daily_carbs_g INTEGER,
  daily_fat_g INTEGER,
  daily_fiber_g INTEGER,
  timezone TEXT DEFAULT 'Asia/Taipei',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own profile" ON user_profiles FOR ALL USING (auth.uid() = id);

-- telegram_links
CREATE TABLE telegram_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_user_id BIGINT UNIQUE NOT NULL,
  telegram_username TEXT,
  linked_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own telegram link" ON telegram_links FOR ALL USING (auth.uid() = user_id);

-- reminder_settings
CREATE TABLE reminder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('breakfast','lunch','dinner','snack','water','weight','daily_summary')),
  enabled BOOLEAN DEFAULT TRUE,
  time_hhmm TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reminder_type)
);
ALTER TABLE reminder_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own reminders" ON reminder_settings FOR ALL USING (auth.uid() = user_id);

-- daily_logs
CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  sleep_start TIMESTAMPTZ,
  sleep_end TIMESTAMPTZ,
  sleep_quality TEXT CHECK (sleep_quality IN ('good','fair','poor','bad')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own daily logs" ON daily_logs FOR ALL USING (auth.uid() = user_id);

-- food_entries
CREATE TABLE food_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  meal_type TEXT CHECK (meal_type IN ('breakfast','lunch','dinner','snack','midnight')),
  food_name TEXT NOT NULL,
  quantity_desc TEXT,
  calories NUMERIC(7,1),
  protein_g NUMERIC(6,1),
  carbs_g NUMERIC(6,1),
  fat_g NUMERIC(6,1),
  fiber_g NUMERIC(6,1),
  is_estimated BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual','photo','ai')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE food_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own food entries" ON food_entries FOR ALL USING (auth.uid() = user_id);

-- exercise_entries
CREATE TABLE exercise_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  exercise_name TEXT NOT NULL,
  duration_min INTEGER,
  calories_burned NUMERIC(6,1),
  intensity TEXT CHECK (intensity IN ('light','moderate','hard','very_hard')),
  is_estimated BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE exercise_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own exercise entries" ON exercise_entries FOR ALL USING (auth.uid() = user_id);

-- water_entries
CREATE TABLE water_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  amount_ml INTEGER NOT NULL,
  logged_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE water_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own water entries" ON water_entries FOR ALL USING (auth.uid() = user_id);
