-- 005_sleep_hours.sql | 2026-10-02 | add sleep_hours to daily_logs
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS sleep_hours NUMERIC(4,2);
