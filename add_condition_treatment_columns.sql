-- Add condition and treatment columns to patients table

ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS condition VARCHAR(100) DEFAULT 'Checkup',
ADD COLUMN IF NOT EXISTS treatment VARCHAR(100) DEFAULT 'Scaling';

-- Update existing patients with default values
UPDATE patients 
SET condition = 'Checkup' 
WHERE condition IS NULL;

UPDATE patients 
SET treatment = 'Scaling' 
WHERE treatment IS NULL;

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_patients_condition ON patients(condition);
CREATE INDEX IF NOT EXISTS idx_patients_treatment ON patients(treatment);
