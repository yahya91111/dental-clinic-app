-- =============================================
-- MIGRATION: Convert pending_patients.pending_doctor_id from INTEGER to UUID
-- =============================================
-- This migration converts the pending_doctor_id column from INTEGER to UUID
-- to match the new UUID-based pending_doctors table structure.
-- =============================================

BEGIN;

-- Step 1: Drop foreign key constraint if exists
ALTER TABLE pending_patients 
DROP CONSTRAINT IF EXISTS pending_patients_pending_doctor_id_fkey;

-- Step 2: Truncate table to remove all data (since we can't convert INTEGER to UUID)
TRUNCATE TABLE pending_patients CASCADE;

-- Step 3: Convert pending_doctor_id column from INTEGER to UUID
ALTER TABLE pending_patients 
ALTER COLUMN pending_doctor_id TYPE UUID USING NULL;

-- Step 4: Re-create foreign key constraint with CASCADE delete
ALTER TABLE pending_patients
ADD CONSTRAINT pending_patients_pending_doctor_id_fkey
FOREIGN KEY (pending_doctor_id) 
REFERENCES pending_doctors(id) 
ON DELETE CASCADE;

COMMIT;

-- =============================================
-- VERIFICATION QUERIES
-- =============================================
-- Run these to verify the migration:

-- 1. Check pending_patients structure
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pending_patients'
ORDER BY ordinal_position;

-- 2. Check foreign key constraints
SELECT
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.table_name = 'pending_patients' 
  AND tc.constraint_type = 'FOREIGN KEY';
