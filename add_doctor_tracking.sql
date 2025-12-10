-- Add doctor tracking fields to patients table
ALTER TABLE patients 
ADD COLUMN IF NOT EXISTS doctor_id INTEGER,
ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255);

-- Create index on doctor_id for faster queries
CREATE INDEX IF NOT EXISTS idx_patients_doctor_id ON patients(doctor_id);

-- Add comment
COMMENT ON COLUMN patients.doctor_id IS 'ID of the doctor who completed the treatment';
COMMENT ON COLUMN patients.doctor_name IS 'Name of the doctor who completed the treatment';
