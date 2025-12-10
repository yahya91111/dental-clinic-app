-- ============================================
-- Dental Clinic Auto-Archive System (FINAL)
-- Automatic daily archiving at 23:59 (before end of day)
-- ============================================

-- Step 1: Create archive function
CREATE OR REPLACE FUNCTION archive_all_patients()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update all patients: set archive_date to today
  UPDATE patients
  SET archive_date = CURRENT_DATE
  WHERE archive_date IS NULL;
  
  -- Log the archiving
  RAISE NOTICE 'Auto-archive completed at %', NOW();
END;
$$;

-- Step 2: Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 3: Remove old cron job (if exists)
SELECT cron.unschedule('daily-patient-archive');

-- Step 4: Schedule daily archiving at 23:59 (before end of day)
-- Note: Supabase uses UTC timezone by default
SELECT cron.schedule(
  'daily-patient-archive',
  '59 23 * * *',  -- Every day at 23:59
  $$SELECT archive_all_patients()$$
);

-- Step 5: Verify the cron job
SELECT * FROM cron.job WHERE jobname = 'daily-patient-archive';

-- ============================================
-- Testing (Optional)
-- ============================================

-- To test manually, run:
-- SELECT archive_all_patients();

-- To check archived patients:
-- SELECT * FROM patients WHERE archive_date IS NOT NULL;

-- To check active patients:
-- SELECT * FROM patients WHERE archive_date IS NULL;
