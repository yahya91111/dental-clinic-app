-- =============================================
-- MIGRATION: Convert patients table to use UUID for virtual_center_id and doctor_id
-- =============================================
-- This migration converts virtual_center_id and doctor_id columns from INTEGER to UUID
-- to match the new UUID-based pending_doctors and doctors table structure.
-- =============================================

BEGIN;

-- Step 1: Drop foreign key constraints if exist
ALTER TABLE patients 
DROP CONSTRAINT IF EXISTS patients_doctor_id_fkey;

ALTER TABLE patients 
DROP CONSTRAINT IF EXISTS patients_virtual_center_id_fkey;

-- Step 2: Truncate table to remove all data (since we can't convert INTEGER to UUID)
TRUNCATE TABLE patients CASCADE;

-- Step 3: Convert doctor_id column from INTEGER to UUID
ALTER TABLE patients 
ALTER COLUMN doctor_id TYPE UUID USING NULL;

-- Step 4: Convert virtual_center_id column from INTEGER to UUID  
ALTER TABLE patients 
ALTER COLUMN virtual_center_id TYPE UUID USING NULL;

-- Step 5: Re-create foreign key constraints with CASCADE delete
-- Note: We'll add these constraints later when we know the exact table structure

COMMIT;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================
-- Run these to verify the migration:

-- 1. Check patients structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'patients'
ORDER BY ordinal_position;

-- 2. Verify UUID columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'patients' 
  AND column_name IN ('doctor_id', 'virtual_center_id');
