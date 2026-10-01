-- 004_inbody.sql | 2026-10-01 | inbody_records table + user_profiles new columns

-- inbody_records
CREATE TABLE IF NOT EXISTS inbody_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  weight_kg NUMERIC(5,2),
  muscle_kg NUMERIC(5,2),
  fat_kg NUMERIC(5,2),
  pbf NUMERIC(5,2),
  bmi NUMERIC(5,2),
  bmr INTEGER,
  visceral_fat_level INTEGER,
  score INTEGER,
  water_kg NUMERIC(5,2),
  lean_mass_kg NUMERIC(5,2),
  protein_kg NUMERIC(5,2),
  bone_mineral_kg NUMERIC(5,2),
  whr NUMERIC(5,3),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE inbody_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own inbody records" ON inbody_records FOR ALL USING (auth.uid() = user_id);

-- user_profiles: add goal + water columns
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS goal_fat_loss_kg NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS goal_deadline DATE,
  ADD COLUMN IF NOT EXISTS daily_water_ml INTEGER DEFAULT 2000;
