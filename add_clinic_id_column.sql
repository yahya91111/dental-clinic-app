-- Add clinic_id column to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS clinic_id INTEGER;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON patients(clinic_id);

-- Update existing patients with clinic_id based on clinic name (if needed)
-- Uncomment and adjust if you want to migrate existing data:
-- UPDATE patients SET clinic_id = 1 WHERE clinic = 'Clinic 1';
-- UPDATE patients SET clinic_id = 2 WHERE clinic = 'Clinic 2';
-- UPDATE patients SET clinic_id = 3 WHERE clinic = 'Clinic 3';
-- UPDATE patients SET clinic_id = 4 WHERE clinic = 'Clinic 4';
-- UPDATE patients SET clinic_id = 5 WHERE clinic = 'Clinic 5';
