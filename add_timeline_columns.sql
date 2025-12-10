-- Add timeline columns to patients table
-- Run this SQL in Supabase SQL Editor

ALTER TABLE patients
ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS clinic_entry_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS doctor_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN patients.registered_at IS 'وقت تسجيل المريض';
COMMENT ON COLUMN patients.clinic_entry_at IS 'وقت دخول المريض للعيادة';
COMMENT ON COLUMN patients.completed_at IS 'وقت الانتهاء من العلاج';
COMMENT ON COLUMN patients.doctor_name IS 'اسم الطبيب الذي أنهى العلاج';
